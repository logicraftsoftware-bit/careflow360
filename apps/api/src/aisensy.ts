import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

export type AppointmentMessage = {
  appointmentId: string; patientName: string; patientMobile: string; patientNumber: string;
  clinicName: string; clinicPhone: string; doctorName: string; departmentName: string; branchName: string;
  appointmentNumber: string; startsAt: Date; amount: number; token?: string | null;
};
const indiaDate = (value: Date) => value.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
const indiaTime = (value: Date) => value.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
const whatsappNumber = (value: string) => { const digits=value.replace(/\D/g, ""); return digits.length===10?`+91${digits}`:`+${digits}`; };

async function sendCampaign(campaignName: string | undefined, appointment: AppointmentMessage, templateParams: string[], media?: { url: string; filename: string }) {
  if (!config.AISENSY_API_KEY || !campaignName) return { sent:false, skipped:true, reason:"AiSensy is not configured" };
  const response=await fetch(config.AISENSY_API_URL,{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(10000),body:JSON.stringify({apiKey:config.AISENSY_API_KEY,campaignName,destination:whatsappNumber(appointment.patientMobile),userName:appointment.patientName,source:"CareFlow360 CRM",templateParams,...(media?{media}:{})})});
  const responseText=await response.text();
  if(!response.ok)throw new Error(`AiSensy returned ${response.status}: ${responseText.slice(0,500)}`);
  return {sent:true,status:response.status,response:responseText.slice(0,500)};
}
export const paymentLinkFor=(appointmentNumber:string)=>`${config.APP_URL.replace(/\/$/,"")}/payment/${encodeURIComponent(appointmentNumber)}`;
export const tokenImageSignature=(appointmentId:string)=>createHmac("sha256",config.JWT_SECRET).update(`appointment-token:${appointmentId}`).digest("hex");
export function validTokenImageSignature(appointmentId:string,signature:string){const expected=Buffer.from(tokenImageSignature(appointmentId),"hex"),supplied=Buffer.from(signature,"hex");return expected.length===supplied.length&&timingSafeEqual(expected,supplied);}
export const tokenImageUrlFor=(appointmentId:string)=>`${config.APP_URL.replace(/\/$/,"")}/api/public/appointment-token/${appointmentId}.png?signature=${tokenImageSignature(appointmentId)}`;
export const sendPaymentPendingMessage=(a:AppointmentMessage)=>sendCampaign(config.AISENSY_CAMPAIGN_PAYMENT_PENDING,a,[a.patientName,a.clinicName,a.doctorName,a.departmentName,indiaDate(a.startsAt),indiaTime(a.startsAt),String(a.amount),paymentLinkFor(a.appointmentNumber)]);
export const sendPaymentSuccessMessage=(a:AppointmentMessage)=>sendCampaign(config.AISENSY_CAMPAIGN_PAYMENT_SUCCESS,a,[a.patientName,a.clinicName,a.doctorName,a.departmentName,indiaDate(a.startsAt),indiaTime(a.startsAt),a.token||"Not generated",String(a.amount)],{url:tokenImageUrlFor(a.appointmentId),filename:`${a.token||a.appointmentNumber}.png`});
export const sendCancelledMessage=(a:AppointmentMessage,cancellationReason:string)=>sendCampaign(config.AISENSY_CAMPAIGN_CANCELLED,a,[a.patientName,a.clinicName,a.doctorName,a.departmentName,indiaDate(a.startsAt),indiaTime(a.startsAt),a.token||"Not generated",cancellationReason,a.clinicPhone]);
export const sendRescheduledMessage=(a:AppointmentMessage,previousStartsAt:Date)=>sendCampaign(config.AISENSY_CAMPAIGN_RESCHEDULED,a,[a.patientName,a.clinicName,a.doctorName,a.departmentName,indiaDate(previousStartsAt),indiaTime(previousStartsAt),indiaDate(a.startsAt),indiaTime(a.startsAt),a.token||"Pending payment",a.clinicPhone]);
