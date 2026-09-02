import { Router } from 'express'; import { z } from 'zod'; import { asyncRoute, audit, ok, platformOnly, prisma, auth, AppError } from '../lib.js';
import { encryptIntegrationSecret } from '../aisensy.js';
import { config } from '../config.js';
export const adminRouter=Router(); adminRouter.use(auth,platformOnly);
adminRouter.get('/dashboard',asyncRoute(async(_req,res)=>{const [total,active,pending,suspended,leads,appointments]=await Promise.all([prisma.tenant.count(),prisma.tenant.count({where:{status:'ACTIVE'}}),prisma.tenant.count({where:{status:'PENDING_APPROVAL'}}),prisma.tenant.count({where:{status:'SUSPENDED'}}),prisma.lead.count(),prisma.appointment.count()]);return ok(res,{totalTenants:total,activeTenants:active,pendingApprovals:pending,suspendedTenants:suspended,totalLeads:leads,totalAppointments:appointments})}));
adminRouter.get('/tenants',asyncRoute(async(req,res)=>ok(res,await prisma.tenant.findMany({include:{subscriptions:{include:{plan:true}}},orderBy:{createdAt:'desc'}}))));
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
    where:{deletedAt:null},
    select:{id:true,name:true,email:true,status:true,aisensyIntegration:true},
    orderBy:{name:'asc'},
  });
  return ok(res,tenants.map(({aisensyIntegration:stored,...tenant})=>{
    const usesDemoFallback=!stored&&tenant.name.toLowerCase().includes('demo clinic')&&Boolean(config.AISENSY_API_KEY);
    const integration=stored?{
      apiUrl:stored.apiUrl,hasApiKey:Boolean(stored.apiKeyEncrypted),campaignPaymentPending:stored.campaignPaymentPending,campaignPaymentSuccess:stored.campaignPaymentSuccess,campaignCancelled:stored.campaignCancelled,campaignRescheduled:stored.campaignRescheduled,isActive:stored.isActive,updatedAt:stored.updatedAt,
    }:usesDemoFallback?{
      apiUrl:config.AISENSY_API_URL,hasApiKey:true,campaignPaymentPending:config.AISENSY_CAMPAIGN_PAYMENT_PENDING||'',campaignPaymentSuccess:config.AISENSY_CAMPAIGN_PAYMENT_SUCCESS||'',campaignCancelled:config.AISENSY_CAMPAIGN_CANCELLED||'',campaignRescheduled:config.AISENSY_CAMPAIGN_RESCHEDULED||'',isActive:true,fromEnvironment:true,
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
    isActive:z.boolean().default(true),
  }).parse(req.body);
  const [tenant,existing]=await Promise.all([
    prisma.tenant.findFirst({where:{id:req.params.id,deletedAt:null}}),
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
