import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AppError, asyncRoute, auth, ok, prisma, tenantId, audit } from "../lib.js";
import { decryptIntegrationSecret } from "../aisensy.js";
import { meaningfulTelecmiAgentName, telecmiAgentAliases } from "../telecmi-agent.js";

export const telecmiRouter = Router();
const digits=(value:unknown)=>{const found=String(value??"").replace(/\D/g,"");return found.length>10?found.slice(-10):found};
const asDate=(value:unknown)=>{if(value===undefined||value===null||value==="")return undefined;const numeric=Number(value),parsed=Number.isFinite(numeric)?new Date(numeric):new Date(String(value));return Number.isNaN(parsed.getTime())?undefined:parsed};
const endpoint=(base:string,path:string)=>`${base.replace(/\/$/,"")}/${path}`;

async function telecmiPost(integration:any,path:string,body:Record<string,unknown>={}){
  const response=await fetch(endpoint(integration.apiUrl,path),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({appid:Number(integration.appId)||integration.appId,secret:decryptIntegrationSecret(integration.appSecretEncrypted),...body}),signal:AbortSignal.timeout(20000)});
  const result:any=await response.json().catch(()=>({}));
  if(!response.ok||result.code&&Number(result.code)!==200)throw new AppError(502,result.msg||result.message||`TeleCMI ${path} request failed`,`TELECMI_${path.toUpperCase()}_FAILED`);
  return result;
}

export async function listTelecmiUsers(tenant:string){
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tenant}});
  if(!integration?.isActive)throw new AppError(503,"TeleCMI is not configured or active for this clinic","INTEGRATION_NOT_CONFIGURED");
  let result=await telecmiPost(integration,'user/all');
  let rows=result.agents||result.data?.agents||result.data;
  if(!Array.isArray(rows)||rows.length===0){
    const v3Integration={...integration,apiUrl:integration.apiUrl.replace(/\/v2\/?$/,'/v3')};
    result=await telecmiPost(v3Integration,'user/list',{page:1,limit:100});
    rows=result.agents||result.data?.agents||result.data;
  }
  return (Array.isArray(rows)?rows:[]).map((agent:any)=>({
    id:String(agent.agent_id||agent.user_id),name:String(agent.name||[agent.first_name,agent.last_name].filter(Boolean).join(' ')||agent.agent_id||agent.user_id),extension:agent.extension===undefined?null:Number(agent.extension),phone:agent.phone?String(agent.phone):null,notify:Boolean(agent.notify),startTime:agent.start_time||null,endTime:agent.end_time||null
  }));
}

async function currentTelecmiUser(req:any){
  const user=await prisma.user.findUnique({where:{id:req.user!.id},include:{tenant:true}});
  if(!user)throw new AppError(401,'User account not found','UNAUTHENTICATED');
  const isAdmin=user.isPlatform||Boolean(user.tenant&&user.email.trim().toLowerCase()===user.tenant.email.trim().toLowerCase());
  return {user,isAdmin};
}

async function updateTelecmiUserStatus(tenant:string,agentId:string,status:'online'|'offline'|'break'){
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tenant}});
  if(!integration?.isActive)throw new AppError(503,'TeleCMI is not configured or active for this clinic','INTEGRATION_NOT_CONFIGURED');
  const apiV2=integration.apiUrl.replace(/\/v3\/?$/,'/v2');
  const response=await fetch(endpoint(apiV2,'user/status'),{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({appid:Number(integration.appId)||integration.appId,secret:decryptIntegrationSecret(integration.appSecretEncrypted),id:agentId,status}),signal:AbortSignal.timeout(20000)});
  const result:any=await response.json().catch(()=>({}));
  const success=response.ok&&(Number(result.code)===200||String(result.code).toLowerCase()==='cmi-200'||String(result.status).toLowerCase()===status);
  if(!success)throw new AppError(502,result.msg||result.message||'Unable to update TeleCMI user status','TELECMI_STATUS_UPDATE_FAILED');
  return {status:String(result.status||status).toLowerCase(),message:result.msg||'Status updated successfully'};
}

async function connlyToken(emailId:string,password:string){
  const response=await fetch('https://api.connle.com/agent/login',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({email_id:emailId,password}),signal:AbortSignal.timeout(20000)});
  const result:any=await response.json().catch(()=>({}));
  const token=result.token||result.data?.token;
  if(!response.ok||Number(result.code)!==200||!token)throw new AppError(502,result.msg||result.message||'Unable to create Connly agent session','CONNLY_LOGIN_FAILED');
  return String(token);
}

async function matchContact(tenantId:string,number:string){
  const patient=await prisma.patient.findFirst({where:{tenantId,mobile:{endsWith:number}}});
  const lead=patient?.leadId?await prisma.lead.findUnique({where:{id:patient.leadId}}):await prisma.lead.findFirst({where:{tenantId,mobile:{endsWith:number}}});
  return {patient,lead};
}

function telecmiCallStatus(cdr:any,answered:boolean):'RINGING'|'ANSWERED'|'COMPLETED'|'MISSED'|'ABANDONED'|'FAILED'|'UNKNOWN'{
  const status=String(cdr.status||cdr.call_status||'').toLowerCase();
  if(/miss|no.?answer/.test(status))return 'MISSED';
  if(/fail|reject/.test(status))return 'FAILED';
  if(/abandon|cancel/.test(status))return 'ABANDONED';
  if(/wait|start|ring/.test(status))return 'RINGING';
  if(/answer/.test(status))return String(cdr.type).toLowerCase()==='cdr'||Number(cdr.answeredsec||cdr.duration)>0?'COMPLETED':'ANSWERED';
  if(/complete|hangup|end/.test(status))return 'COMPLETED';
  // The dedicated missed feeds often omit status; their duration is ring/queue time.
  return answered?'COMPLETED':'MISSED';
}

async function storeCdr(tenantId:string,cdr:any,direction:"INBOUND"|"OUTBOUND",answered:boolean){
  const externalId=String(cdr.conversation_uuid||cdr.cmiuid||cdr.cmiuuid||cdr.call_id||randomUUID());
  const callerNumber=digits(direction==="INBOUND"?cdr.from:cdr.to);
  if(!callerNumber)return;
  const {patient,lead}=await matchContact(tenantId,callerNumber);
  const startedAt=asDate(cdr.time),durationSeconds=Number(cdr.duration||cdr.answeredsec||0),billed=Number(cdr.billedsec||cdr.answeredsec||0),reportedAgentId=cdr.agent||cdr.user,status=telecmiCallStatus(cdr,answered);
  const agentAliases=telecmiAgentAliases(reportedAgentId);
  const extension=agentAliases.length>1?Number(agentAliases[1]):undefined;
  const assignedAgent=agentAliases.length?await prisma.user.findFirst({where:{tenantId,OR:[{telecmiAgentId:{in:agentAliases}},...(extension!==undefined?[{telecmiExtension:extension}]:[])]}}):null;
  const agentExternalId=assignedAgent?.telecmiAgentId||agentAliases[0];
  const recording=String(cdr.recording_url||cdr.recording||""),filename=String(cdr.filename||cdr.voicename||"");
  const recordingUrl=/^https?:\/\//.test(recording)?recording:filename?`/integrations/telecmi/recordings/${encodeURIComponent(filename)}`:undefined;
  const virtualNumber=direction==="INBOUND"?digits(cdr.virtual_number||cdr.did||cdr.to)||undefined:undefined;
  const reportedAgentName=meaningfulTelecmiAgentName(cdr.agent_name)||meaningfulTelecmiAgentName(cdr.name);
  const agentName=assignedAgent?.telecmiAgentName||assignedAgent?.name||reportedAgentName||agentExternalId||undefined;
  const common={direction,status,callerNumber,destinationNumber:digits(direction==="INBOUND"?cdr.to:cdr.from)||undefined,virtualNumber,agentId:assignedAgent?.id,agentExternalId:agentExternalId?String(agentExternalId):undefined,agentName,leadId:lead?.id,patientId:patient?.id,startedAt,answeredAt:(status==='ANSWERED'||status==='COMPLETED')&&startedAt?new Date(startedAt.getTime()+Math.max(0,durationSeconds-billed)*1000):undefined,endedAt:status==='COMPLETED'&&startedAt?new Date(startedAt.getTime()+durationSeconds*1000):undefined,durationSeconds,ivrSelection:cdr.ivr_name||undefined,disposition:cdr.hangup_reason||cdr.notes?.[0]?.msg,notes:cdr.notes?.map((note:any)=>note.msg).filter(Boolean).join("; "),recordingUrl,rawPayload:cdr};
  await prisma.callRecord.upsert({where:{provider_externalId:{provider:"TELECMI",externalId}},create:{tenantId,provider:"TELECMI",externalId,...common},update:common});
}

export async function syncTelecmiCalls(tenant:string,startDate:Date,endDate:Date){
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tenant}});
  if(!integration?.isActive)throw new AppError(503,"TeleCMI is not configured or active for this clinic","INTEGRATION_NOT_CONFIGURED");
  const feeds=[['answered','INBOUND',true],['missed','INBOUND',false],['out_answered','OUTBOUND',true],['out_missed','OUTBOUND',false]] as const;
  let synced=0;
  for(const [path,direction,answered] of feeds){
    const result=await telecmiPost(integration,path,{start_date:startDate.getTime(),end_date:endDate.getTime(),page:1,limit:100});
    for(const cdr of result.cdr||result.data?.cdr||[]){await storeCdr(tenant,cdr,direction,answered);synced++}
  }
  return {synced};
}

export async function telecmiAccountReport(tenant:string,startDate:Date,endDate:Date){
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tenant}});
  if(!integration?.isActive)throw new AppError(503,"TeleCMI is not configured or active for this clinic","INTEGRATION_NOT_CONFIGURED");
  const [analysis,balance]=await Promise.all([telecmiPost(integration,'analysis',{start_date:startDate.getTime(),end_date:endDate.getTime()}),telecmiPost(integration,'balance')]);
  return {analysis,balance};
}

const receiveTelecmiWebhook=asyncRoute(async(req,res)=>{
  const incoming:any=req.method==='GET'?req.query:req.body,body:any=incoming?.data||incoming,appId=String(body.app_id||body.appid||'');
  const integration=await prisma.telecmiIntegration.findFirst({where:{appId,isActive:true}});
  if(!integration)throw new AppError(401,'Unknown TeleCMI App ID','INVALID_TELECMI_APP');
  const callId=String(body.conversation_uuid||body.cmiuid||body.cmiuuid||body.call_id||body.request_id||randomUUID()),eventId=`${callId}:${body.status||body.call_status||'update'}:${body.leg||'call'}:${body.time||Date.now()}`;
  const duplicate=await prisma.webhookEvent.findUnique({where:{provider_externalId:{provider:'TELECMI',externalId:eventId}}});
  if(duplicate)return ok(res,{accepted:true,duplicate:true});
  const direction=String(body.direction||'inbound').toLowerCase()==='outbound'?'OUTBOUND':'INBOUND';
  const status=String(body.status||body.call_status||'').toLowerCase(),answered=Boolean(body.billedsec||body.answeredsec)||/answer|complete|hangup/.test(status)&&!/miss|fail/.test(status);
  await prisma.$transaction(async tx=>tx.webhookEvent.create({data:{provider:'TELECMI',externalId:eventId,payload:req.body,processedAt:new Date()}}));
  await storeCdr(integration.tenantId,body,direction,answered);
  return ok(res,{accepted:true},'TeleCMI event processed');
});
telecmiRouter.post('/webhook',receiveTelecmiWebhook);
telecmiRouter.get('/webhook',receiveTelecmiWebhook);

telecmiRouter.post('/sync',auth,asyncRoute(async(req,res)=>{const tid=tenantId(req),body=z.object({startDate:z.coerce.date(),endDate:z.coerce.date()}).parse(req.body);const result=await syncTelecmiCalls(tid,body.startDate,body.endDate);await audit(req,'telecmi.calls.synced','CallRecord',undefined,result);return ok(res,result,'TeleCMI calls synchronized')}));
telecmiRouter.get('/users',auth,asyncRoute(async(req,res)=>ok(res,{items:await listTelecmiUsers(tenantId(req))})));
telecmiRouter.get('/me',auth,asyncRoute(async(req,res)=>{const {user,isAdmin}=await currentTelecmiUser(req);return ok(res,{agentId:user.telecmiAgentId,agentName:user.telecmiAgentName,extension:user.telecmiExtension,isAdmin,canCall:Boolean(user.telecmiAgentId)})}));
telecmiRouter.post('/status',auth,asyncRoute(async(req,res)=>{
  const tid=tenantId(req),{user}=await currentTelecmiUser(req),body=z.object({status:z.enum(['online','offline','break'])}).parse(req.body);
  if(!user.telecmiAgentId)throw new AppError(403,'No TeleCMI user is assigned to this staff account','TELECMI_AGENT_NOT_ASSIGNED');
  const result=await updateTelecmiUserStatus(tid,String(user.telecmiAgentId),body.status);
  await audit(req,'telecmi.agent.status.updated','User',user.id,{agentId:user.telecmiAgentId,status:result.status});
  return ok(res,result,'TeleCMI agent status updated');
}));
telecmiRouter.get('/softphone-credentials',auth,asyncRoute(async(req,res)=>{
  const tid=tenantId(req),{user}=await currentTelecmiUser(req);
  if(!user.telecmiAgentId)throw new AppError(403,'No TeleCMI user is assigned to this staff account','TELECMI_AGENT_NOT_ASSIGNED');
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tid}});
  if(!integration?.isActive)throw new AppError(503,'TeleCMI is not configured or active for this clinic','INTEGRATION_NOT_CONFIGURED');
  const result=await telecmiPost(integration,'user/get',{id:user.telecmiAgentId}),agent=result.agent||result.data?.agent||result.data;
  if(!agent?.password)throw new AppError(502,'TeleCMI did not return the assigned user softphone password','TELECMI_SOFTPHONE_CREDENTIALS_UNAVAILABLE');
  if(!user.telecmiLoginEmail)throw new AppError(409,'TeleCMI login email is missing. Edit this staff account and enter the email used to sign in to TeleCMI','CONNLY_EMAIL_NOT_CONFIGURED');
  const token=await connlyToken(user.telecmiLoginEmail,String(agent.password));
  res.setHeader('Cache-Control','no-store, private');res.setHeader('Pragma','no-cache');
  await audit(req,'telecmi.softphone.credentials.issued','User',user.id,{agentId:user.telecmiAgentId});
  return ok(res,{userId:String(user.telecmiAgentId),password:String(agent.password),sbcUri:'sbcind.telecmi.com',displayName:user.telecmiAgentName||user.name,connlyToken:token,connlyServerUrl:'https://socket.connle.com'});
}));
telecmiRouter.get('/recordings/:filename',auth,asyncRoute(async(req,res)=>{
  const tid=tenantId(req),filename=String(req.params.filename||'');
  if(!/^[a-zA-Z0-9_.-]+\.(mp3|wav)$/i.test(filename))throw new AppError(400,'Invalid TeleCMI recording filename','INVALID_RECORDING');
  const recordingUrl=`/integrations/telecmi/recordings/${encodeURIComponent(filename)}`;
  const call=await prisma.callRecord.findFirst({where:{tenantId:tid,provider:'TELECMI',recordingUrl}});
  if(!call)throw new AppError(404,'Recording not found for this clinic','RECORDING_NOT_FOUND');
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tid}});
  if(!integration?.isActive)throw new AppError(503,'TeleCMI is not configured or active for this clinic','INTEGRATION_NOT_CONFIGURED');
  const url=new URL('https://piopiy.telecmi.com/v1/play');
  url.searchParams.set('appid',integration.appId);url.searchParams.set('token',decryptIntegrationSecret(integration.appSecretEncrypted));url.searchParams.set('file',filename);
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new AppError(502,'Unable to load TeleCMI recording','TELECMI_RECORDING_FAILED');
  const audio=Buffer.from(await response.arrayBuffer());
  res.setHeader('Content-Type',response.headers.get('content-type')||(/\.wav$/i.test(filename)?'audio/wav':'audio/mpeg'));
  res.setHeader('Content-Disposition',`inline; filename="${filename}"`);res.setHeader('Cache-Control','private, max-age=300');res.send(audio);
}));
telecmiRouter.post('/make-call',auth,asyncRoute(async(req,res)=>{
  const tid=tenantId(req),{user}=await currentTelecmiUser(req),body=z.object({to:z.string().trim().min(7).max(20)}).parse(req.body);
  if(!user.telecmiAgentId)throw new AppError(403,'No TeleCMI user is assigned to this staff account','TELECMI_AGENT_NOT_ASSIGNED');
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tid}});
  if(!integration?.isActive)throw new AppError(503,'TeleCMI is not configured or active for this clinic','INTEGRATION_NOT_CONFIGURED');
  let digitsTo=body.to.replace(/\D/g,'');if(digitsTo.length===10)digitsTo=`91${digitsTo}`;
  if(digitsTo.length<10||digitsTo.length>15)throw new AppError(400,'Enter a valid phone number with country code','INVALID_PHONE');
  const callerDigits=integration.businessNumber.replace(/\D/g,''),payload:any={user_id:String(user.telecmiAgentId),secret:decryptIntegrationSecret(integration.appSecretEncrypted),to:Number(digitsTo),extra_params:{crm:true,crm_staff_id:user.id},webrtc:false,followme:true};
  if(callerDigits)payload.callerid=Number(callerDigits);
  const apiV2=integration.apiUrl.replace(/\/v3\/?$/,'/v2');
  const response=await fetch(endpoint(apiV2,'webrtc/click2call'),{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  const result:any=await response.json().catch(()=>({}));
  if(!response.ok||result.code&&Number(result.code)!==200)throw new AppError(502,result.msg||result.message||'Unable to start TeleCMI call','TELECMI_CALL_FAILED');
  await audit(req,'telecmi.call.started','CallRecord',undefined,{agentId:user.telecmiAgentId,to:digitsTo,requestId:result.request_id});
  return ok(res,result,'TeleCMI call started');
}));
telecmiRouter.get('/calls',auth,asyncRoute(async(req,res)=>{
  const tid=tenantId(req),{user,isAdmin}=await currentTelecmiUser(req);
  if(!isAdmin&&!user.telecmiAgentId)throw new AppError(403,'No TeleCMI user is assigned to this staff account','TELECMI_AGENT_NOT_ASSIGNED');
  const query=z.object({status:z.string().optional(),category:z.enum(['ANSWERED','MISSED']).optional(),direction:z.enum(['INBOUND','OUTBOUND']).optional(),search:z.string().optional(),agentId:z.string().optional(),startDate:z.coerce.date().optional(),endDate:z.coerce.date().optional(),allTime:z.enum(['true']).optional(),page:z.coerce.number().min(1).default(1),limit:z.coerce.number().min(1).max(5000).default(25)}).parse(req.query);
  const end=query.endDate||new Date(),start=query.startDate||new Date(end.getTime()-30*24*60*60*1000);
  await syncTelecmiCalls(tid,start,end);
  const scope:any={tenantId:tid,provider:'TELECMI',...(query.allTime?{}:{startedAt:{gte:start,lte:end}}),...(!isAdmin?{agentExternalId:user.telecmiAgentId}:query.agentId?{agentExternalId:query.agentId}:{})},where:any={...scope};
  if(query.status)where.status=query.status;
  else if(query.category==='ANSWERED')where.status={in:['ANSWERED','COMPLETED']};
  else if(query.category==='MISSED')where.status='MISSED';
  if(query.direction)where.direction=query.direction;
  if(query.search)where.OR=[{callerNumber:{contains:query.search}},{agentName:{contains:query.search,mode:'insensitive'}},{externalId:{contains:query.search}}];
  const[items,total,metricRows]=await Promise.all([
    prisma.callRecord.findMany({where,include:{lead:{select:{id:true,name:true,leadNumber:true}},patient:{select:{id:true,name:true,patientNumber:true}}},orderBy:{startedAt:'desc'},skip:(query.page-1)*query.limit,take:query.limit}),
    prisma.callRecord.count({where}),
    // Analytics must use the same filters as the rows and total. Previously this
    // used `scope`, so changing direction/status/search only updated the call list
    // while every dashboard card, chart and agent metric remained unchanged.
    prisma.callRecord.findMany({where,select:{direction:true,status:true,durationSeconds:true,startedAt:true,agentExternalId:true,agentName:true}})
  ]);
  const answered=(row:any)=>row.status==='ANSWERED'||row.status==='COMPLETED',missed=(row:any)=>row.status==='MISSED',totalDuration=metricRows.filter(answered).reduce((sum:number,row:any)=>sum+(row.durationSeconds||0),0);
  const byHour=Array.from({length:24},(_,hour)=>({hour,total:0,answered:0,missed:0})),agentsMap=new Map<string,any>();
  for(const row of metricRows){const hour=row.startedAt?.getHours()??0,hit=byHour[hour];hit.total++;if(answered(row))hit.answered++;else if(missed(row))hit.missed++;const key=row.agentExternalId||row.agentName||'unassigned',agent=agentsMap.get(key)||{id:key,name:row.agentName||key,total:0,inboundAnswered:0,inboundMissed:0,outboundAnswered:0,outboundMissed:0,durationSeconds:0};agent.total++;if(answered(row))agent.durationSeconds+=row.durationSeconds||0;if(answered(row)||missed(row)){const field=`${row.direction.toLowerCase()}${answered(row)?'Answered':'Missed'}`;agent[field]++;}agentsMap.set(key,agent)}
  const answeredCount=metricRows.filter(answered).length,incoming=metricRows.filter((row:any)=>row.direction==='INBOUND'),outgoing=metricRows.filter((row:any)=>row.direction==='OUTBOUND');
  const missedCount=metricRows.filter(missed).length,decidedCount=answeredCount+missedCount;
  return ok(res,{items,total,page:query.page,limit:query.limit,analytics:{totalCalls:metricRows.length,answered:answeredCount,missed:missedCount,received:incoming.length,outgoing:outgoing.length,incomingAnswered:incoming.filter(answered).length,incomingMissed:incoming.filter(missed).length,outgoingAnswered:outgoing.filter(answered).length,outgoingMissed:outgoing.filter(missed).length,totalDurationSeconds:totalDuration,averageDurationSeconds:answeredCount?Math.round(totalDuration/answeredCount):0,answerRate:decidedCount?Math.round(answeredCount*100/decidedCount):0,byHour,byAgent:[...agentsMap.values()].sort((a,b)=>b.total-a.total)}})
}));
