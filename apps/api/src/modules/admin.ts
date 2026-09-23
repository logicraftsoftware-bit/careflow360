import { Router } from 'express'; import { z } from 'zod'; import { asyncRoute, audit, ok, platformOnly, prisma, auth, AppError } from '../lib.js';
import { encryptIntegrationSecret } from '../aisensy.js';
import { config } from '../config.js';
import argon2 from 'argon2';
import { syncTelecmiCalls, telecmiAccountReport } from './telecmi.js';
import { syncClinicToErp } from '../erp-sync.js';
export const adminRouter=Router(); adminRouter.use(auth,platformOnly);
adminRouter.get('/dashboard',asyncRoute(async(_req,res)=>{const [total,active,pending,suspended,leads,appointments]=await Promise.all([prisma.tenant.count(),prisma.tenant.count({where:{status:'ACTIVE'}}),prisma.tenant.count({where:{status:'PENDING_APPROVAL'}}),prisma.tenant.count({where:{status:'SUSPENDED'}}),prisma.lead.count(),prisma.appointment.count()]);return ok(res,{totalTenants:total,activeTenants:active,pendingApprovals:pending,suspendedTenants:suspended,totalLeads:leads,totalAppointments:appointments})}));
adminRouter.get('/subscriptions',asyncRoute(async(_req,res)=>{
  const [subscriptions,transactions,activity]=await Promise.all([
    prisma.subscription.findMany({include:{tenant:true,plan:true},orderBy:{createdAt:'desc'}}),
    prisma.moduleRecord.findMany({where:{module:'transactions'},orderBy:{createdAt:'desc'}}),
    prisma.auditLog.findMany({where:{entityType:{in:['Subscription','Tenant']}},include:{actor:{select:{name:true,email:true}}},orderBy:{createdAt:'desc'}}),
  ]);
  return ok(res,subscriptions.map(subscription=>{
    const paymentLogs=transactions.filter(transaction=>{
      const data=transaction.data as Record<string,unknown>;
      return data.subscriptionId===subscription.id||data.tenantId===subscription.tenantId||data.tenant===subscription.tenant.name||data.clinic===subscription.tenant.name;
    }).map(transaction=>({id:transaction.id,reference:transaction.title,provider:(transaction.data as any).provider,amount:(transaction.data as any).amount,status:transaction.status,createdAt:transaction.createdAt,updatedAt:transaction.updatedAt}));
    const amount=subscription.billingCycle==='ANNUAL'?subscription.plan.annualPrice:subscription.plan.monthlyPrice;
    const activityLogs=activity.filter(log=>log.entityId===subscription.id||log.entityId===subscription.tenantId).map(log=>({id:log.id,action:log.action,performedBy:log.actor?.name||log.actor?.email||'System',metadata:log.metadata,createdAt:log.createdAt}));
    return {...subscription,tenantName:subscription.tenant.name,ownerName:subscription.tenant.ownerName,ownerEmail:subscription.tenant.email,planName:subscription.plan.name,currency:subscription.plan.currency,amount,paymentStatus:paymentLogs[0]?.status||'NOT_RECORDED',paymentReference:paymentLogs[0]?.reference||null,paymentLogs,activityLogs,invoiceNumber:`CF-${subscription.createdAt.getFullYear()}-${subscription.id.slice(-8).toUpperCase()}`};
  }));
}));
adminRouter.get('/tenants',asyncRoute(async(req,res)=>ok(res,await prisma.tenant.findMany({include:{subscriptions:{include:{plan:true},orderBy:{createdAt:'desc'},take:1}},orderBy:{createdAt:'desc'}}))));
const tenantInput=z.object({name:z.string().trim().min(2),ownerName:z.string().trim().min(2),email:z.string().email(),mobile:z.string().trim().min(8),password:z.string().min(8).optional(),address:z.string().optional(),city:z.string().optional(),state:z.string().optional(),pin:z.string().optional(),planId:z.string(),billingCycle:z.enum(['MONTHLY','ANNUAL']),status:z.enum(['ACTIVE','TRIAL','PENDING_APPROVAL','SUSPENDED','REJECTED'])});
adminRouter.get('/tenants/:id',asyncRoute(async(req,res)=>{const tenant=await prisma.tenant.findUnique({where:{id:req.params.id},include:{subscriptions:{orderBy:{createdAt:'desc'},take:1}}});if(!tenant)throw new AppError(404,'Clinic not found','NOT_FOUND');return ok(res,tenant)}));
adminRouter.post('/tenants',asyncRoute(async(req,res)=>{const body=tenantInput.extend({password:z.string().min(8)}).parse(req.body);const plan=await prisma.plan.findUnique({where:{id:body.planId}});if(!plan)throw new AppError(400,'Selected plan does not exist','PLAN_NOT_FOUND');if(await prisma.user.findFirst({where:{email:body.email.toLowerCase()}}))throw new AppError(409,'Owner email is already registered','EMAIL_EXISTS');const slug=`${body.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Date.now().toString(36)}`;const tenant=await prisma.$transaction(async tx=>{const created=await tx.tenant.create({data:{name:body.name,slug,ownerName:body.ownerName,email:body.email.toLowerCase(),mobile:body.mobile,address:body.address,city:body.city,state:body.state,pin:body.pin,status:body.status}});const owner=await tx.user.create({data:{tenantId:created.id,name:body.ownerName,email:body.email.toLowerCase(),mobile:body.mobile,passwordHash:await argon2.hash(body.password)}});const role=await tx.role.create({data:{tenantId:created.id,name:'Clinic Admin',code:'CLINIC_ADMIN',isSystem:true}});await tx.userRole.create({data:{userId:owner.id,roleId:role.id}});await tx.subscription.create({data:{tenantId:created.id,planId:body.planId,billingCycle:body.billingCycle,status:body.status==='ACTIVE'?'ACTIVE':body.status==='TRIAL'?'TRIAL':'PENDING'}});return created});await audit(req,'tenant.created','Tenant',tenant.id,{ownerName:body.ownerName});return ok(res,tenant,'Clinic created successfully',201)}));
adminRouter.patch('/tenants/:id',asyncRoute(async(req,res)=>{const body=tenantInput.partial().parse(req.body);const tenant=await prisma.tenant.findUnique({where:{id:req.params.id}});if(!tenant)throw new AppError(404,'Clinic not found','NOT_FOUND');const email=(body.email||tenant.email).toLowerCase();const duplicate=await prisma.user.findFirst({where:{email,id:{not:req.params.id},tenantId:{not:tenant.id}}});if(duplicate)throw new AppError(409,'Owner email is already registered','EMAIL_EXISTS');const updated=await prisma.$transaction(async tx=>{const clinic=await tx.tenant.update({where:{id:tenant.id},data:{name:body.name,ownerName:body.ownerName,email:body.email?.toLowerCase(),mobile:body.mobile,address:body.address,city:body.city,state:body.state,pin:body.pin,status:body.status}});const owner=await tx.user.findFirst({where:{tenantId:tenant.id,email:tenant.email}});if(owner)await tx.user.update({where:{id:owner.id},data:{name:body.ownerName,email:body.email?.toLowerCase(),mobile:body.mobile,...(body.password?{passwordHash:await argon2.hash(body.password)}:{})}});if(body.planId){const subscription=await tx.subscription.findFirst({where:{tenantId:tenant.id},orderBy:{createdAt:'desc'}});if(subscription)await tx.subscription.update({where:{id:subscription.id},data:{planId:body.planId,billingCycle:body.billingCycle}});else await tx.subscription.create({data:{tenantId:tenant.id,planId:body.planId,billingCycle:body.billingCycle||'MONTHLY'}})}return clinic});await audit(req,'tenant.updated','Tenant',tenant.id);return ok(res,updated,'Clinic updated successfully')}));
adminRouter.patch('/tenants/:id/status',asyncRoute(async(req,res)=>{const {status,reason}=z.object({status:z.enum(['ACTIVE','REJECTED','SUSPENDED','TRIAL']),reason:z.string().optional()}).parse(req.body);const tenant=await prisma.tenant.findUnique({where:{id:req.params.id}});if(!tenant)throw new AppError(404,'Tenant not found','NOT_FOUND');const updated=await prisma.$transaction(async tx=>{const t=await tx.tenant.update({where:{id:tenant.id},data:{status,rejectionReason:reason}});await tx.subscription.updateMany({where:{tenantId:t.id},data:{status:status==='ACTIVE'?'ACTIVE':status==='TRIAL'?'TRIAL':status==='SUSPENDED'?'SUSPENDED':'CANCELLED',...(status==='TRIAL'?{trialStart:new Date(),trialEnd:new Date(Date.now()+14*86400000)}:{})}});return t});await audit(req,`tenant.${status.toLowerCase()}`,'Tenant',tenant.id,{reason});return ok(res,updated,'Tenant status updated')}));
adminRouter.get('/plans',asyncRoute(async(_req,res)=>ok(res,await prisma.plan.findMany({include:{features:{include:{feature:true}},limits:true}}))));
adminRouter.post('/plans',asyncRoute(async(req,res)=>{const data=z.object({name:z.string(),code:z.string(),description:z.string().optional(),monthlyPrice:z.number(),annualPrice:z.number(),trialDays:z.number().default(14),currency:z.string().default('INR'),popular:z.boolean().default(false)}).parse(req.body);const row=await prisma.plan.create({data:{name:data.name,code:data.code,description:data.description,monthlyPrice:data.monthlyPrice,annualPrice:data.annualPrice,trialDays:data.trialDays,currency:data.currency,popular:data.popular}});await audit(req,'plan.created','Plan',row.id);return ok(res,row,'Plan created',201)}));
adminRouter.patch('/plans/:id',asyncRoute(async(req,res)=>{const data=z.object({name:z.string().optional(),description:z.string().optional(),monthlyPrice:z.number().optional(),annualPrice:z.number().optional(),trialDays:z.number().optional(),currency:z.string().optional(),popular:z.boolean().optional(),status:z.enum(['ACTIVE','INACTIVE']).optional()}).parse(req.body);const row=await prisma.plan.update({where:{id:req.params.id},data});await audit(req,'plan.updated','Plan',row.id);return ok(res,row,'Plan updated')}));
adminRouter.delete('/plans/:id',asyncRoute(async(req,res)=>{const subscriptions=await prisma.subscription.count({where:{planId:req.params.id}});if(subscriptions)throw new AppError(409,'Deactivate plans that are assigned to tenants','PLAN_IN_USE');await prisma.plan.delete({where:{id:req.params.id}});await audit(req,'plan.deleted','Plan',req.params.id);return ok(res,null,'Plan deleted')}));
const platformRecordScope={OR:[{tenantId:null},{tenantId:{isSet:false}}]};
adminRouter.get('/modules/:module',asyncRoute(async(req,res)=>{const items=await prisma.moduleRecord.findMany({where:{module:req.params.module,...platformRecordScope},orderBy:{createdAt:'desc'}});return ok(res,{items,total:items.length,page:1,limit:100})}));
adminRouter.post('/modules/:module',asyncRoute(async(req,res)=>{const {title,status='ACTIVE',...data}=req.body;const row=await prisma.moduleRecord.create({data:{tenantId:null,module:req.params.module,title:title||data.name||'Untitled record',status,data}});await audit(req,`${req.params.module}.created`,'ModuleRecord',row.id);return ok(res,row,'Created successfully',201)}));
adminRouter.patch('/modules/:module/:id',asyncRoute(async(req,res)=>{const found=await prisma.moduleRecord.findFirst({where:{id:req.params.id,module:req.params.module,...platformRecordScope}});if(!found)throw new AppError(404,'Record not found','NOT_FOUND');const {title,status,...data}=req.body;const row=await prisma.moduleRecord.update({where:{id:found.id},data:{title:title||found.title,status:status||found.status,data:{...(found.data as object),...data}}});await audit(req,`${req.params.module}.updated`,'ModuleRecord',row.id);return ok(res,row,'Updated successfully')}));
adminRouter.delete('/modules/:module/:id',asyncRoute(async(req,res)=>{const found=await prisma.moduleRecord.findFirst({where:{id:req.params.id,module:req.params.module,...platformRecordScope}});if(!found)throw new AppError(404,'Record not found','NOT_FOUND');await prisma.moduleRecord.delete({where:{id:found.id}});await audit(req,`${req.params.module}.deleted`,'ModuleRecord',found.id);return ok(res,null,'Deleted successfully')}));

adminRouter.get('/aisensy-integrations',asyncRoute(async(_req,res)=>{
  const tenants=await prisma.tenant.findMany({
    where:{OR:[{deletedAt:null},{deletedAt:{isSet:false}}]},
    select:{id:true,name:true,email:true,status:true,aisensyIntegration:true},
    orderBy:{name:'asc'},
  });
  return ok(res,tenants.map(({aisensyIntegration:stored,...tenant})=>{
    const usesDemoFallback=!stored&&tenant.name.toLowerCase().includes('demo clinic')&&Boolean(config.AISENSY_API_KEY);
    const integration=stored?{
      apiUrl:stored.apiUrl,hasApiKey:Boolean(stored.apiKeyEncrypted),campaignPaymentPending:stored.campaignPaymentPending,campaignPaymentSuccess:stored.campaignPaymentSuccess,campaignCancelled:stored.campaignCancelled,campaignRescheduled:stored.campaignRescheduled,campaignDiagnosticPending:stored.campaignDiagnosticPending,campaignDiagnosticSuccess:stored.campaignDiagnosticSuccess,campaignDiagnosticCancelled:stored.campaignDiagnosticCancelled,campaignDiagnosticRescheduled:stored.campaignDiagnosticRescheduled,campaignCollectionOtp:stored.campaignCollectionOtp,isActive:stored.isActive,updatedAt:stored.updatedAt,
    }:usesDemoFallback?{
      apiUrl:config.AISENSY_API_URL,hasApiKey:true,campaignPaymentPending:config.AISENSY_CAMPAIGN_PAYMENT_PENDING||'',campaignPaymentSuccess:config.AISENSY_CAMPAIGN_PAYMENT_SUCCESS||'',campaignCancelled:config.AISENSY_CAMPAIGN_CANCELLED||'',campaignRescheduled:config.AISENSY_CAMPAIGN_RESCHEDULED||'',campaignDiagnosticPending:'careflow_diagnostic_payment_pending',campaignDiagnosticSuccess:'careflow_diagnostic_payment_success',campaignDiagnosticCancelled:'careflow_diagnostic_cancelled',campaignDiagnosticRescheduled:'careflow_diagnostic_rescheduled',campaignCollectionOtp:'careflow_collection_otp',isActive:true,fromEnvironment:true,
    }:null;
    return {...tenant,integration};
  }));
}));

adminRouter.put('/tenants/:id/aisensy',asyncRoute(async(req,res)=>{
  const body=z.object({
    apiUrl:z.string().url(),
    apiKey:z.string().trim().optional().default(''),
    campaignPaymentPending:z.string().trim().min(2),
    campaignPaymentSuccess:z.string().trim().min(2),
    campaignCancelled:z.string().trim().min(2),
    campaignRescheduled:z.string().trim().min(2),
    campaignDiagnosticPending:z.string().trim().min(2),campaignDiagnosticSuccess:z.string().trim().min(2),campaignDiagnosticCancelled:z.string().trim().min(2),campaignDiagnosticRescheduled:z.string().trim().min(2),campaignCollectionOtp:z.string().trim().min(2),
    isActive:z.boolean().default(true),
  }).parse(req.body);
  const [tenant,existing]=await Promise.all([
    prisma.tenant.findFirst({where:{id:req.params.id,OR:[{deletedAt:null},{deletedAt:{isSet:false}}]}}),
    prisma.aiSensyIntegration.findUnique({where:{tenantId:req.params.id}}),
  ]);
  if(!tenant)throw new AppError(404,'Clinic not found','NOT_FOUND');
  const migratableApiKey=!existing&&tenant.name.toLowerCase().includes('demo clinic')?config.AISENSY_API_KEY:'';
  const apiKey=body.apiKey||migratableApiKey;
  if(!existing&&!apiKey)throw new AppError(400,'AiSensy API key is required','API_KEY_REQUIRED');
  const data={
    apiUrl:body.apiUrl,
    campaignPaymentPending:body.campaignPaymentPending,
    campaignPaymentSuccess:body.campaignPaymentSuccess,
    campaignCancelled:body.campaignCancelled,
    campaignRescheduled:body.campaignRescheduled,
    campaignDiagnosticPending:body.campaignDiagnosticPending,campaignDiagnosticSuccess:body.campaignDiagnosticSuccess,campaignDiagnosticCancelled:body.campaignDiagnosticCancelled,campaignDiagnosticRescheduled:body.campaignDiagnosticRescheduled,campaignCollectionOtp:body.campaignCollectionOtp,
    isActive:body.isActive,
    ...(body.apiKey?{apiKeyEncrypted:encryptIntegrationSecret(body.apiKey)}:{}),
  };
  const row=await prisma.aiSensyIntegration.upsert({
    where:{tenantId:tenant.id},
    create:{tenantId:tenant.id,...data,apiKeyEncrypted:encryptIntegrationSecret(apiKey!)},
    update:data,
  });
  await audit(req,'tenant.aisensy.updated','Tenant',tenant.id,{
    clinicName:tenant.name,
    apiUrl:row.apiUrl,
    campaigns:[row.campaignPaymentPending,row.campaignPaymentSuccess,row.campaignCancelled,row.campaignRescheduled],
    isActive:row.isActive,
    apiKeyChanged:Boolean(body.apiKey),
  });
  return ok(res,{hasApiKey:true,updatedAt:row.updatedAt},'AiSensy integration saved');
}));

adminRouter.get('/cashfree-integrations',asyncRoute(async(_req,res)=>{
  const tenants=await prisma.tenant.findMany({
    where:{OR:[{deletedAt:null},{deletedAt:{isSet:false}}]},
    select:{id:true,name:true,email:true,status:true,cashfreeIntegration:true},
    orderBy:{name:'asc'},
  });
  return ok(res,tenants.map(({cashfreeIntegration:stored,...tenant})=>({
    ...tenant,
    integration:stored?{
      appId:stored.appId,
      hasSecretKey:Boolean(stored.secretKeyEncrypted),
      isTestMode:stored.isTestMode,
      isActive:stored.isActive,
      updatedAt:stored.updatedAt,
    }:null,
  })));
}));

adminRouter.put('/tenants/:id/cashfree',asyncRoute(async(req,res)=>{
  const body=z.object({
    appId:z.string().trim().min(3),
    secretKey:z.string().trim().optional().default(''),
    isTestMode:z.boolean().default(true),
    isActive:z.boolean().default(true),
  }).parse(req.body);
  const [tenant,existing]=await Promise.all([
    prisma.tenant.findFirst({where:{id:req.params.id,OR:[{deletedAt:null},{deletedAt:{isSet:false}}]}}),
    prisma.cashfreeIntegration.findUnique({where:{tenantId:req.params.id}}),
  ]);
  if(!tenant)throw new AppError(404,'Clinic not found','NOT_FOUND');
  if(!existing&&!body.secretKey)
    throw new AppError(400,'Cashfree Secret Key is required','SECRET_KEY_REQUIRED');
  const data={
    appId:body.appId,
    isTestMode:body.isTestMode,
    isActive:body.isActive,
    ...(body.secretKey?{secretKeyEncrypted:encryptIntegrationSecret(body.secretKey)}:{}),
  };
  const row=await prisma.cashfreeIntegration.upsert({
    where:{tenantId:tenant.id},
    create:{
      tenantId:tenant.id,
      ...data,
      secretKeyEncrypted:encryptIntegrationSecret(body.secretKey),
    },
    update:data,
  });
  await audit(req,'tenant.cashfree.updated','Tenant',tenant.id,{
    clinicName:tenant.name,
    appId:row.appId,
    isTestMode:row.isTestMode,
    isActive:row.isActive,
    secretKeyChanged:Boolean(body.secretKey),
  });
  return ok(res,{
    hasSecretKey:true,
    updatedAt:row.updatedAt,
  },'Cashfree integration saved');
}));

adminRouter.get('/telecmi-integrations',asyncRoute(async(_req,res)=>{
  const tenants=await prisma.tenant.findMany({where:{OR:[{deletedAt:null},{deletedAt:{isSet:false}}]},select:{id:true,name:true,email:true,status:true,telecmiIntegration:true},orderBy:{name:'asc'}});
  return ok(res,tenants.map(({telecmiIntegration:stored,...tenant})=>({...tenant,integration:stored?{appId:stored.appId,businessNumber:stored.businessNumber,apiUrl:stored.apiUrl,webhookUrl:stored.webhookUrl||'',hasAppSecret:Boolean(stored.appSecretEncrypted),isTestMode:stored.isTestMode,isActive:stored.isActive,updatedAt:stored.updatedAt}:null})));
}));

adminRouter.get('/telecmi-report',asyncRoute(async(req,res)=>{
  const query=z.object({from:z.coerce.date().optional(),to:z.coerce.date().optional()}).parse(req.query),from=query.from||new Date(Date.now()-30*86400000),to=query.to||new Date();
  const [calls,integrations]=await Promise.all([prisma.callRecord.findMany({where:{provider:'TELECMI',startedAt:{gte:from,lte:to}},include:{tenant:{select:{id:true,name:true}},lead:{select:{name:true,leadNumber:true}},patient:{select:{name:true,patientNumber:true}}},orderBy:{startedAt:'desc'},take:1000}),prisma.telecmiIntegration.findMany({include:{tenant:{select:{id:true,name:true}}}})]);
  const summary=integrations.map(integration=>{const rows=calls.filter(call=>call.tenantId===integration.tenantId);return {tenantId:integration.tenantId,clinic:integration.tenant.name,configured:true,active:integration.isActive,total:rows.length,answered:rows.filter(call=>['ANSWERED','COMPLETED'].includes(call.status)).length,missed:rows.filter(call=>call.status==='MISSED').length,inbound:rows.filter(call=>call.direction==='INBOUND').length,outbound:rows.filter(call=>call.direction==='OUTBOUND').length,totalDurationSeconds:rows.reduce((sum,call)=>sum+(call.durationSeconds||0),0)}});
  return ok(res,{from,to,summary,calls});
}));

adminRouter.post('/tenants/:id/telecmi/sync',asyncRoute(async(req,res)=>{const body=z.object({startDate:z.coerce.date(),endDate:z.coerce.date()}).parse(req.body),result=await syncTelecmiCalls(req.params.id,body.startDate,body.endDate);await audit(req,'tenant.telecmi.calls.synced','Tenant',req.params.id,result);return ok(res,result,'TeleCMI reports synchronized')}));
adminRouter.get('/tenants/:id/telecmi/account-report',asyncRoute(async(req,res)=>{const query=z.object({from:z.coerce.date(),to:z.coerce.date()}).parse(req.query);return ok(res,await telecmiAccountReport(req.params.id,query.from,query.to))}));

adminRouter.put('/tenants/:id/telecmi',asyncRoute(async(req,res)=>{
  const body=z.object({appId:z.string().trim().min(2).max(200),appSecret:z.string().trim().max(1000).optional().default(''),businessNumber:z.string().trim().min(5).max(30),apiUrl:z.string().url(),webhookUrl:z.union([z.string().url(),z.literal('')]).optional().default(''),isTestMode:z.boolean().default(false),isActive:z.boolean().default(true)}).parse(req.body);
  const [tenant,existing]=await Promise.all([prisma.tenant.findFirst({where:{id:req.params.id,OR:[{deletedAt:null},{deletedAt:{isSet:false}}]}}),prisma.telecmiIntegration.findUnique({where:{tenantId:req.params.id}})]);
  if(!tenant)throw new AppError(404,'Clinic not found','NOT_FOUND');
  if(!existing&&!body.appSecret)throw new AppError(400,'TeleCMI App Secret is required','APP_SECRET_REQUIRED');
  const data={appId:body.appId,businessNumber:body.businessNumber,apiUrl:body.apiUrl,webhookUrl:body.webhookUrl||null,isTestMode:body.isTestMode,isActive:body.isActive,...(body.appSecret?{appSecretEncrypted:encryptIntegrationSecret(body.appSecret)}:{})};
  const row=await prisma.telecmiIntegration.upsert({where:{tenantId:tenant.id},create:{tenantId:tenant.id,...data,appSecretEncrypted:encryptIntegrationSecret(body.appSecret)},update:data});
  await audit(req,'tenant.telecmi.updated','Tenant',tenant.id,{clinicName:tenant.name,appId:row.appId,businessNumber:row.businessNumber,apiUrl:row.apiUrl,webhookConfigured:Boolean(row.webhookUrl),isTestMode:row.isTestMode,isActive:row.isActive,appSecretChanged:Boolean(body.appSecret)});
  return ok(res,{hasAppSecret:true,updatedAt:row.updatedAt},'TeleCMI integration saved');
}));

adminRouter.get('/erp-integrations',asyncRoute(async(_req,res)=>{
  const tenants=await prisma.tenant.findMany({where:{OR:[{deletedAt:null},{deletedAt:{isSet:false}}]},select:{id:true,name:true,email:true,status:true,erpOutboundIntegration:true},orderBy:{name:'asc'}});
  return ok(res,tenants.map(({erpOutboundIntegration:row,...tenant})=>({...tenant,integration:row?{baseUrl:row.baseUrl,hasApiKey:Boolean(row.apiKeyEncrypted),isActive:row.isActive,timeoutMs:row.timeoutMs,lastSyncStartedAt:row.lastSyncStartedAt,lastSyncFinishedAt:row.lastSyncFinishedAt,lastSuccessAt:row.lastSuccessAt,lastFailureAt:row.lastFailureAt,lastResult:row.lastResult,lastHttpStatus:row.lastHttpStatus,lastCounts:row.lastCounts,lastError:row.lastError,inProgress:Boolean(row.syncLockedAt),updatedAt:row.updatedAt}:null})));
}));

adminRouter.put('/tenants/:id/erp-integration',asyncRoute(async(req,res)=>{
  const body=z.object({baseUrl:z.string().url(),apiKey:z.string().trim().optional().default(''),timeoutMs:z.coerce.number().int().min(1000).max(120000).default(30000),isActive:z.boolean().default(true)}).parse(req.body);
  const [tenant,existing]=await Promise.all([prisma.tenant.findFirst({where:{id:req.params.id,OR:[{deletedAt:null},{deletedAt:{isSet:false}}]}}),prisma.erpOutboundIntegration.findUnique({where:{tenantId:req.params.id}})]);
  if(!tenant)throw new AppError(404,'Clinic not found','NOT_FOUND');
  if(!existing&&!body.apiKey)throw new AppError(400,'ERP API key is required','API_KEY_REQUIRED');
  const data={baseUrl:body.baseUrl.replace(/\/$/,''),timeoutMs:body.timeoutMs,isActive:body.isActive,...(body.apiKey?{apiKeyEncrypted:encryptIntegrationSecret(body.apiKey)}:{})};
  const row=await prisma.erpOutboundIntegration.upsert({where:{tenantId:tenant.id},create:{tenantId:tenant.id,...data,apiKeyEncrypted:encryptIntegrationSecret(body.apiKey)},update:data});
  await audit(req,'tenant.erp_integration.updated','Tenant',tenant.id,{clinicName:tenant.name,baseUrl:row.baseUrl,timeoutMs:row.timeoutMs,isActive:row.isActive,apiKeyChanged:Boolean(body.apiKey)});
  return ok(res,{hasApiKey:true,updatedAt:row.updatedAt},'ERP integration saved');
}));

adminRouter.post('/tenants/:id/erp-sync',asyncRoute(async(req,res)=>{
  const result=await syncClinicToErp(req.params.id);await audit(req,'tenant.erp.synced','Tenant',req.params.id,result);return ok(res,result,'ERP synchronization completed');
}));
