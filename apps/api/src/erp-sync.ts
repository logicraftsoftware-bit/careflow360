import { AppError, prisma } from "./lib.js";
import { decryptIntegrationSecret } from "./aisensy.js";

type Counts = { branches:number; departments:number; doctors:number; patients:number; appointments:number };
export type ErpBootstrapPayload = { branches:any[]; departments:any[]; doctors:any[]; patients:any[]; appointments:any[] };

const active = (status:string) => status === "ACTIVE";
const codeFor = (name:string,id:string) => (name.replace(/[^a-z0-9]/gi,"").toUpperCase().slice(0,12) || `CF${id.slice(-8)}`);
const address = (line?:string|null,city?:string|null,state?:string|null,pinCode?:string|null,country?:string|null) =>
  Object.fromEntries(Object.entries({line,city,state,pinCode,country}).filter(([,value])=>Boolean(value)));

export function isoWithOffset(value:Date,timeZone:string){
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(value).map(p=>[p.type,p.value]));
  const localAsUtc=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second),minutes=Math.round((localAsUtc-value.getTime())/60000),sign=minutes>=0?"+":"-",absolute=Math.abs(minutes);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${String(Math.floor(absolute/60)).padStart(2,"0")}:${String(absolute%60).padStart(2,"0")}`;
}

export async function buildBootstrapPayload(tenantId:string):Promise<ErpBootstrapPayload>{
  const [tenant,branches,departments,doctors,patients,appointments]=await Promise.all([
    prisma.tenant.findUniqueOrThrow({where:{id:tenantId},select:{timezone:true}}),
    prisma.branch.findMany({where:{tenantId}}),
    prisma.department.findMany({where:{tenantId}}),
    prisma.doctor.findMany({where:{tenantId},include:{branches:true,schedules:{where:{tenantId,status:"ACTIVE"}}}}),
    prisma.patient.findMany({where:{tenantId}}),
    prisma.appointment.findMany({where:{tenantId},orderBy:{startsAt:"asc"}}),
  ]);
  const branchIds=new Set(branches.map(x=>x.id)),departmentIds=new Set(departments.map(x=>x.id)),doctorIds=new Set(doctors.map(x=>x.id)),patientIds=new Set(patients.map(x=>x.id));
  return {
    branches:branches.map(x=>({externalId:x.id,updatedAt:x.updatedAt.toISOString(),name:x.name,code:codeFor(x.name,x.id),phone:x.phone||undefined,address:address(x.address,x.city,x.state,x.pin,x.country),active:active(x.status)})),
    departments:departments.map(x=>({externalId:x.id,updatedAt:x.updatedAt.toISOString(),branchExternalId:x.branchId&&branchIds.has(x.branchId)?x.branchId:null,name:x.name,code:x.code,active:active(x.status)})),
    doctors:doctors.flatMap(x=>{
      const branchId=x.branches.find(link=>branchIds.has(link.branchId))?.branchId;
      if(!branchId)return [];
      return [{externalId:x.id,updatedAt:x.updatedAt.toISOString(),branchExternalId:branchId,departmentExternalId:x.departmentId&&departmentIds.has(x.departmentId)?x.departmentId:undefined,name:x.name,email:x.email||undefined,mobile:x.mobile||undefined,qualification:x.qualification||undefined,specialization:x.specialization||undefined,registrationNumber:x.registrationNumber||undefined,consultationFee:Math.max(0,x.consultationFee),active:active(x.status),schedules:x.schedules.filter(s=>s.branchId===branchId&&s.scheduleDate).map(s=>({date:s.scheduleDate!.toLocaleDateString("en-CA",{timeZone:tenant.timezone}),from:s.startTime,to:s.endTime,maxSlots:Math.min(500,Math.max(1,s.maxPatients))}))}];
    }),
    patients:patients.map(x=>({externalId:x.id,updatedAt:x.updatedAt.toISOString(),branchExternalId:appointments.find(a=>a.patientId===x.id&&branchIds.has(a.branchId))?.branchId||branches[0]?.id,medicalRecordNumber:x.patientNumber||undefined,name:x.name,mobile:x.mobile,email:x.email||undefined,gender:["male","female","other"].includes((x.gender||"").toLowerCase())?x.gender!.toLowerCase():"unknown",address:address(x.address,x.city,x.state,x.pin),active:active(x.status)})).filter(x=>x.branchExternalId),
    appointments:appointments.filter(x=>branchIds.has(x.branchId)&&departmentIds.has(x.departmentId)&&doctorIds.has(x.doctorId)&&patientIds.has(x.patientId)).map(x=>({externalId:x.id,updatedAt:x.updatedAt.toISOString(),appointmentNumber:x.appointmentNumber,branchExternalId:x.branchId,departmentExternalId:x.departmentId,doctorExternalId:x.doctorId,patientExternalId:x.patientId,startsAt:isoWithOffset(x.startsAt,tenant.timezone),status:x.status==="CANCELLED"?"Cancelled":x.status==="RESCHEDULED"?"Rescheduled":"Booked",visitType:"New",tokenNumber:x.token||undefined})),
  };
}

export function sanitizeErpError(error:unknown){
  const message=error instanceof Error?error.message:"ERP synchronization failed";
  return message.replace(/cferp_[A-Za-z0-9_-]+/g,"[REDACTED]").replace(/(x-api-key|authorization)\s*[:=]\s*[^\s,;]+/gi,"$1: [REDACTED]").slice(0,500);
}

async function postWithRetry(url:string,apiKey:string,payload:ErpBootstrapPayload,timeoutMs:number){
  let response:Response|undefined;
  for(let attempt=0;attempt<3;attempt++){
    try{response=await fetch(`${url.replace(/\/$/,"")}/api/v1/crm-sync/bootstrap`,{method:"POST",headers:{"content-type":"application/json",accept:"application/json","x-api-key":apiKey},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)});}catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,250*2**attempt));continue;}
    if(response.ok)return response;
    if(response.status!==429&&response.status<500)break;
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,250*2**attempt));
  }
  // Do not retain the response body: validation responses can echo patient fields.
  const error=new Error(`ERP returned HTTP ${response?.status||0}`) as Error&{status?:number};error.status=response?.status;throw error;
}

export async function syncClinicToErp(tenantId:string){
  const integration=await prisma.erpOutboundIntegration.findUnique({where:{tenantId}});
  if(!integration?.isActive)throw new AppError(400,"ERP integration is not configured or is inactive","ERP_NOT_CONFIGURED");
  const startedAt=new Date(),stale=new Date(Date.now()-10*60_000);
  const locked=await prisma.erpOutboundIntegration.updateMany({where:{tenantId,OR:[{syncLockedAt:null},{syncLockedAt:{isSet:false}},{syncLockedAt:{lt:stale}}]},data:{syncLockedAt:startedAt,lastSyncStartedAt:startedAt}});
  if(locked.count!==1)throw new AppError(409,"An ERP synchronization is already in progress","ERP_SYNC_IN_PROGRESS");
  let status:number|undefined;
  try{
    const payload=await buildBootstrapPayload(tenantId),response=await postWithRetry(integration.baseUrl,decryptIntegrationSecret(integration.apiKeyEncrypted),payload,integration.timeoutMs);status=response.status;
    const body=await response.json() as any,counts:Counts=body.summary||{branches:payload.branches.length,departments:payload.departments.length,doctors:payload.doctors.length,patients:payload.patients.length,appointments:payload.appointments.length},finishedAt=new Date();
    await prisma.$transaction([prisma.erpOutboundIntegration.update({where:{tenantId},data:{syncLockedAt:null,lastSyncFinishedAt:finishedAt,lastSuccessAt:finishedAt,lastResult:"SUCCESS",lastHttpStatus:status,lastCounts:counts,lastError:null}}),prisma.erpSyncLog.create({data:{tenantId,startedAt,finishedAt,result:"SUCCESS",httpStatus:status,counts}})]);
    return {counts,httpStatus:status};
  }catch(error){
    const finishedAt=new Date(),safe=sanitizeErpError(error);status=(error as any)?.status;
    await prisma.$transaction([prisma.erpOutboundIntegration.update({where:{tenantId},data:{syncLockedAt:null,lastSyncFinishedAt:finishedAt,lastFailureAt:finishedAt,lastResult:"FAILED",lastHttpStatus:status,lastError:safe}}),prisma.erpSyncLog.create({data:{tenantId,startedAt,finishedAt,result:"FAILED",httpStatus:status,error:safe}})]).catch(()=>undefined);
    throw new AppError(502,safe,"ERP_SYNC_FAILED");
  }
}
