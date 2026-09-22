import { Router } from "express";
import { decryptIntegrationSecret } from "../aisensy.js";
import { confirmCashfreeAppointment, confirmCashfreeDiagnostic, verifyCashfreeSignature } from "../cashfree.js";
import { asyncRoute, prisma } from "../lib.js";

export const cashfreeRouter=Router();

cashfreeRouter.post("/webhook",asyncRoute(async(req,res)=>{
  const rawBody=Buffer.isBuffer(req.body)?req.body:Buffer.from(req.body||"");let event:any;
  try{event=JSON.parse(rawBody.toString("utf8"))}catch{return res.status(400).json({success:false,message:"Invalid JSON"})}
  const cfLinkId=String(event.data?.order?.order_tags?.cf_link_id||event.data?.link?.cf_link_id||"");
  if(!cfLinkId)return res.status(400).json({success:false,message:"Missing Cashfree payment-link reference"});
  const payment=await prisma.payment.findUnique({where:{providerTransactionId:cfLinkId}});
  let tenantId=payment?.tenantId||"",appointmentId=payment?.appointmentId||"",diagnosticAppointmentId="";
  if(!payment){const records=await prisma.moduleRecord.findMany({where:{module:{in:["lab-appointments","radiology-appointments"]}},select:{id:true,tenantId:true,data:true}});const record=records.find(row=>String((row.data as any)?.paymentLinkCfId||"")===cfLinkId);if(record){tenantId=record.tenantId||"";diagnosticAppointmentId=record.id}}
  if(!tenantId||(!appointmentId&&!diagnosticAppointmentId))return res.status(404).json({success:false,message:"Unknown Cashfree payment reference"});
  const integration=await prisma.cashfreeIntegration.findUnique({where:{tenantId}});if(!integration?.isActive)return res.status(401).json({success:false,message:"Cashfree is not configured for this clinic"});
  const signature=String(req.headers["x-webhook-signature"]||""),timestamp=String(req.headers["x-webhook-timestamp"]||"");
  if(!verifyCashfreeSignature(rawBody,signature,timestamp,decryptIntegrationSecret(integration.secretKeyEncrypted)))return res.status(401).json({success:false,message:"Invalid webhook signature"});
  const paymentId=String(event.data?.payment?.cf_payment_id||"");const externalId=paymentId?`${event.type}:${paymentId}`:`${event.type}:${timestamp}:${cfLinkId}`;
  const duplicate=await prisma.webhookEvent.findUnique({where:{provider_externalId:{provider:"CASHFREE",externalId}}});if(duplicate?.processedAt)return res.json({success:true,duplicate:true});
  const webhook=duplicate||await prisma.webhookEvent.create({data:{provider:"CASHFREE",externalId,payload:event}});
  if(event.type==="PAYMENT_SUCCESS_WEBHOOK"){if(diagnosticAppointmentId)await confirmCashfreeDiagnostic(diagnosticAppointmentId,paymentId);else await confirmCashfreeAppointment(appointmentId,paymentId)}
  else if(event.type==="PAYMENT_FAILED_WEBHOOK"&&appointmentId){await prisma.auditLog.create({data:{tenantId,action:"appointment.payment.cashfree_failed",entityType:"Appointment",entityId:appointmentId,metadata:{paymentId:paymentId||null,reason:event.data?.payment?.payment_message||"Payment failed"}}})}
  await prisma.webhookEvent.update({where:{id:webhook.id},data:{processedAt:new Date()}});return res.json({success:true})
}));
