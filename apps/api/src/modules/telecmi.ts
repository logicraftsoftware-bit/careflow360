import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { AppError, asyncRoute, auth, ok, prisma, tenantId, audit } from "../lib.js";
import { decryptIntegrationSecret } from "../aisensy.js";

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

async function matchContact(tenantId:string,number:string){
  const patient=await prisma.patient.findFirst({where:{tenantId,mobile:{endsWith:number}}});
  const lead=patient?.leadId?await prisma.lead.findUnique({where:{id:patient.leadId}}):await prisma.lead.findFirst({where:{tenantId,mobile:{endsWith:number}}});
  return {patient,lead};
}

async function storeCdr(tenantId:string,cdr:any,direction:"INBOUND"|"OUTBOUND",answered:boolean){
  const externalId=String(cdr.conversation_uuid||cdr.cmiuid||cdr.cmiuuid||cdr.call_id||randomUUID());
  const callerNumber=digits(direction==="INBOUND"?cdr.from:cdr.to);
  if(!callerNumber)return;
  const {patient,lead}=await matchContact(tenantId,callerNumber);
  const startedAt=asDate(cdr.time),durationSeconds=Number(cdr.duration||cdr.answeredsec||0),billed=Number(cdr.billedsec||cdr.answeredsec||0),agentId=cdr.agent||cdr.user;
  const recording=String(cdr.recording_url||cdr.recording||"");
  await prisma.callRecord.upsert({where:{provider_externalId:{provider:"TELECMI",externalId}},create:{tenantId,provider:"TELECMI",externalId,direction,status:answered?"COMPLETED":"MISSED",callerNumber,destinationNumber:digits(direction==="INBOUND"?cdr.to:cdr.from)||undefined,virtualNumber:direction==="INBOUND"?digits(cdr.to)||undefined:undefined,agentExternalId:agentId?String(agentId):undefined,agentName:cdr.agent_name||cdr.name||agentId||undefined,leadId:lead?.id,patientId:patient?.id,startedAt,answeredAt:answered&&startedAt?new Date(startedAt.getTime()+Math.max(0,durationSeconds-billed)*1000):undefined,endedAt:startedAt?new Date(startedAt.getTime()+durationSeconds*1000):undefined,durationSeconds,disposition:cdr.notes?.[0]?.msg,notes:cdr.notes?.map((note:any)=>note.msg).filter(Boolean).join("; "),recordingUrl:/^https?:\/\//.test(recording)?recording:undefined,rawPayload:cdr},update:{status:answered?"COMPLETED":"MISSED",agentExternalId:agentId?String(agentId):undefined,agentName:cdr.agent_name||cdr.name||agentId||undefined,leadId:lead?.id,patientId:patient?.id,durationSeconds,disposition:cdr.notes?.[0]?.msg,notes:cdr.notes?.map((note:any)=>note.msg).filter(Boolean).join("; "),recordingUrl:/^https?:\/\//.test(recording)?recording:undefined,rawPayload:cdr}});
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

telecmiRouter.post('/webhook',asyncRoute(async(req,res)=>{
  const body:any=req.body?.data||req.body,appId=String(body.app_id||body.appid||'');
  const integration=await prisma.telecmiIntegration.findFirst({where:{appId,isActive:true}});
  if(!integration)throw new AppError(401,'Unknown TeleCMI App ID','INVALID_TELECMI_APP');
  const callId=String(body.conversation_uuid||body.cmiuid||body.cmiuuid||body.call_id||body.request_id||randomUUID()),eventId=`${callId}:${body.status||body.call_status||'update'}:${body.leg||'call'}:${body.time||Date.now()}`;
  const duplicate=await prisma.webhookEvent.findUnique({where:{provider_externalId:{provider:'TELECMI',externalId:eventId}}});
  if(duplicate)return ok(res,{accepted:true,duplicate:true});
  const direction=String(body.direction||'inbound').toLowerCase()==='outbound'?'OUTBOUND':'INBOUND';
  const status=String(body.status||body.call_status||'').toLowerCase(),answered=Boolean(body.billedsec)||/answer|complete|hangup/.test(status)&&!/miss|fail/.test(status);
  await prisma.$transaction(async tx=>tx.webhookEvent.create({data:{provider:'TELECMI',externalId:eventId,payload:req.body,processedAt:new Date()}}));
  await storeCdr(integration.tenantId,body,direction,answered);
  return ok(res,{accepted:true},'TeleCMI event processed');
}));

telecmiRouter.post('/sync',auth,asyncRoute(async(req,res)=>{const tid=tenantId(req),body=z.object({startDate:z.coerce.date(),endDate:z.coerce.date()}).parse(req.body);const result=await syncTelecmiCalls(tid,body.startDate,body.endDate);await audit(req,'telecmi.calls.synced','CallRecord',undefined,result);return ok(res,result,'TeleCMI calls synchronized')}));
telecmiRouter.get('/users',auth,asyncRoute(async(req,res)=>ok(res,{items:await listTelecmiUsers(tenantId(req))})));
telecmiRouter.get('/me',auth,asyncRoute(async(req,res)=>{const {user,isAdmin}=await currentTelecmiUser(req);return ok(res,{agentId:user.telecmiAgentId,agentName:user.telecmiAgentName,extension:user.telecmiExtension,isAdmin,canCall:Boolean(user.telecmiAgentId)})}));
telecmiRouter.post('/make-call',auth,asyncRoute(async(req,res)=>{
  const tid=tenantId(req),{user}=await currentTelecmiUser(req),body=z.object({to:z.string().trim().min(7).max(20)}).parse(req.body);
  if(!user.telecmiAgentId)throw new AppError(403,'No TeleCMI user is assigned to this staff account','TELECMI_AGENT_NOT_ASSIGNED');
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tid}});
  if(!integration?.isActive)throw new AppError(503,'TeleCMI is not configured or active for this clinic','INTEGRATION_NOT_CONFIGURED');
  let digitsTo=body.to.replace(/\D/g,'');if(digitsTo.length===10)digitsTo=`91${digitsTo}`;
  if(digitsTo.length<10||digitsTo.length>15)throw new AppError(400,'Enter a valid phone number with country code','INVALID_PHONE');
  const callerDigits=integration.businessNumber.replace(/\D/g,''),payload:any={user_id:String(user.telecmiAgentId),secret:decryptIntegrationSecret(integration.appSecretEncrypted),to:Number(digitsTo),webrtc:true,followme:false,extra_params:{crm:true,crm_staff_id:user.id}};
  if(callerDigits)payload.callerid=Number(callerDigits);
  const response=await fetch(endpoint(integration.apiUrl,'webrtc/click2call'),{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  const result:any=await response.json().catch(()=>({}));
  if(!response.ok||result.code&&Number(result.code)!==200)throw new AppError(502,result.msg||result.message||'Unable to start TeleCMI call','TELECMI_CALL_FAILED');
  await audit(req,'telecmi.call.started','CallRecord',undefined,{agentId:user.telecmiAgentId,to:digitsTo,requestId:result.request_id});
  return ok(res,result,'TeleCMI call started');
}));
telecmiRouter.get('/calls',auth,asyncRoute(async(req,res)=>{
  const tid=tenantId(req),{user,isAdmin}=await currentTelecmiUser(req);
  if(!isAdmin&&!user.telecmiAgentId)throw new AppError(403,'No TeleCMI user is assigned to this staff account','TELECMI_AGENT_NOT_ASSIGNED');
  const query=z.object({status:z.string().optional(),direction:z.string().optional(),search:z.string().optional(),agentId:z.string().optional(),startDate:z.coerce.date().optional(),endDate:z.coerce.date().optional(),page:z.coerce.number().min(1).default(1),limit:z.coerce.number().min(1).max(100).default(25)}).parse(req.query);
  const end=query.endDate||new Date(),start=query.startDate||new Date(end.getTime()-30*24*60*60*1000);
  await syncTelecmiCalls(tid,start,end);
  const scope:any={tenantId:tid,provider:'TELECMI',startedAt:{gte:start,lte:end},...(!isAdmin?{agentExternalId:user.telecmiAgentId}:query.agentId?{agentExternalId:query.agentId}:{})},where:any={...scope};
  if(query.status)where.status=query.status;if(query.direction)where.direction=query.direction;
  if(query.search)where.OR=[{callerNumber:{contains:query.search}},{agentName:{contains:query.search,mode:'insensitive'}},{externalId:{contains:query.search}}];
  const[items,total,metricRows]=await Promise.all([
    prisma.callRecord.findMany({where,include:{lead:{select:{id:true,name:true,leadNumber:true}},patient:{select:{id:true,name:true,patientNumber:true}}},orderBy:{startedAt:'desc'},skip:(query.page-1)*query.limit,take:query.limit}),
    prisma.callRecord.count({where}),
    prisma.callRecord.findMany({where:scope,select:{direction:true,status:true,durationSeconds:true,startedAt:true,agentExternalId:true,agentName:true}})
  ]);
  const answered=(row:any)=>row.status==='ANSWERED'||row.status==='COMPLETED',totalDuration=metricRows.reduce((sum:number,row:any)=>sum+(row.durationSeconds||0),0);
  const byHour=Array.from({length:24},(_,hour)=>({hour,total:0,answered:0,missed:0})),agentsMap=new Map<string,any>();
  for(const row of metricRows){const hour=row.startedAt?.getHours()??0,hit=byHour[hour];hit.total++;answered(row)?hit.answered++:hit.missed++;const key=row.agentExternalId||row.agentName||'unassigned',agent=agentsMap.get(key)||{id:key,name:row.agentName||key,total:0,inboundAnswered:0,inboundMissed:0,outboundAnswered:0,outboundMissed:0,durationSeconds:0};agent.total++;agent.durationSeconds+=row.durationSeconds||0;const field=`${row.direction.toLowerCase()}${answered(row)?'Answered':'Missed'}`;agent[field]++;agentsMap.set(key,agent)}
  const answeredCount=metricRows.filter(answered).length,incoming=metricRows.filter((row:any)=>row.direction==='INBOUND'),outgoing=metricRows.filter((row:any)=>row.direction==='OUTBOUND');
  return ok(res,{items,total,page:query.page,limit:query.limit,analytics:{totalCalls:metricRows.length,answered:answeredCount,missed:metricRows.length-answeredCount,received:incoming.length,outgoing:outgoing.length,incomingAnswered:incoming.filter(answered).length,incomingMissed:incoming.filter((row:any)=>!answered(row)).length,outgoingAnswered:outgoing.filter(answered).length,outgoingMissed:outgoing.filter((row:any)=>!answered(row)).length,totalDurationSeconds:totalDuration,averageDurationSeconds:answeredCount?Math.round(totalDuration/answeredCount):0,answerRate:metricRows.length?Math.round(answeredCount*100/metricRows.length):0,byHour,byAgent:[...agentsMap.values()].sort((a,b)=>b.total-a.total)}})
}));
