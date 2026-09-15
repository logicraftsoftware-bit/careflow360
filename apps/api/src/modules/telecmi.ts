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
  const startedAt=asDate(cdr.time),durationSeconds=Number(cdr.duration||0),billed=Number(cdr.billedsec||0);
  const recording=String(cdr.recording_url||cdr.recording||"");
  await prisma.callRecord.upsert({where:{provider_externalId:{provider:"TELECMI",externalId}},create:{tenantId,provider:"TELECMI",externalId,direction,status:answered?"COMPLETED":"MISSED",callerNumber,destinationNumber:digits(direction==="INBOUND"?cdr.to:cdr.from)||undefined,virtualNumber:direction==="INBOUND"?digits(cdr.to)||undefined:undefined,agentExternalId:cdr.agent?String(cdr.agent):undefined,agentName:cdr.agent_name||cdr.agent||undefined,leadId:lead?.id,patientId:patient?.id,startedAt,answeredAt:answered&&startedAt?new Date(startedAt.getTime()+Math.max(0,durationSeconds-billed)*1000):undefined,endedAt:startedAt?new Date(startedAt.getTime()+durationSeconds*1000):undefined,durationSeconds,disposition:cdr.notes?.[0]?.msg,notes:cdr.notes?.map((note:any)=>note.msg).filter(Boolean).join("; "),recordingUrl:/^https?:\/\//.test(recording)?recording:undefined,rawPayload:cdr},update:{status:answered?"COMPLETED":"MISSED",agentExternalId:cdr.agent?String(cdr.agent):undefined,agentName:cdr.agent_name||cdr.agent||undefined,leadId:lead?.id,patientId:patient?.id,durationSeconds,disposition:cdr.notes?.[0]?.msg,notes:cdr.notes?.map((note:any)=>note.msg).filter(Boolean).join("; "),recordingUrl:/^https?:\/\//.test(recording)?recording:undefined,rawPayload:cdr}});
}

export async function syncTelecmiCalls(tenant:string,startDate:Date,endDate:Date){
  const integration=await prisma.telecmiIntegration.findUnique({where:{tenantId:tenant}});
  if(!integration?.isActive)throw new AppError(503,"TeleCMI is not configured or active for this clinic","INTEGRATION_NOT_CONFIGURED");
  const feeds=[['answered','INBOUND',true],['missed','INBOUND',false],['out_answered','OUTBOUND',true],['out_missed','OUTBOUND',false]] as const;
  let synced=0;
  for(const [path,direction,answered] of feeds){
    const result=await telecmiPost(integration,path,{start_date:startDate.getTime(),end_date:endDate.getTime(),page:1,limit:100});
    for(const cdr of result.cdr||[]){await storeCdr(tenant,cdr,direction,answered);synced++}
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
telecmiRouter.get('/calls',auth,asyncRoute(async(req,res)=>{const tid=tenantId(req),query=z.object({status:z.string().optional(),direction:z.string().optional(),search:z.string().optional(),page:z.coerce.number().min(1).default(1),limit:z.coerce.number().min(1).max(100).default(25)}).parse(req.query),where:any={tenantId:tid,provider:'TELECMI'};if(query.status)where.status=query.status;if(query.direction)where.direction=query.direction;if(query.search)where.OR=[{callerNumber:{contains:query.search}},{agentName:{contains:query.search,mode:'insensitive'}},{externalId:{contains:query.search}}];const[items,total]=await Promise.all([prisma.callRecord.findMany({where,include:{lead:{select:{id:true,name:true,leadNumber:true}},patient:{select:{id:true,name:true,patientNumber:true}}},orderBy:{createdAt:'desc'},skip:(query.page-1)*query.limit,take:query.limit}),prisma.callRecord.count({where})]);return ok(res,{items,total,page:query.page,limit:query.limit})}));
