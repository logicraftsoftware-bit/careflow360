import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { prisma } from "./lib.js";

export type AppointmentMessage = {
  appointmentId: string; tenantId: string; patientName: string; patientMobile: string; patientNumber: string;
  clinicName: string; clinicPhone: string; doctorName: string; departmentName: string; branchName: string;
  appointmentNumber: string; startsAt: Date; amount: number; token?: string | null;
};
export type AiSensySettings = { apiUrl:string; apiKey:string; campaignPaymentPending:string; campaignPaymentSuccess:string; campaignCancelled:string; campaignRescheduled:string };
const encryptionKey=()=>createHash("sha256").update(config.JWT_SECRET).digest();
export function encryptIntegrationSecret(value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),iv),encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;}
export function decryptIntegrationSecret(value:string){const [iv,tag,encrypted]=value.split(".");if(!iv||!tag||!encrypted)throw new Error("Invalid encrypted integration secret");const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"hex"));decipher.setAuthTag(Buffer.from(tag,"hex"));return Buffer.concat([decipher.update(Buffer.from(encrypted,"hex")),decipher.final()]).toString("utf8");}
const indiaDate = (value: Date) => value.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
const indiaTime = (value: Date) => value.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
const whatsappNumber = (value: string) => { const digits=value.replace(/\D/g, ""); return digits.length===10?`+91${digits}`:`+${digits}`; };

async function tenantSettings(appointment:AppointmentMessage):Promise<AiSensySettings|null>{const row=await prisma.aiSensyIntegration.findUnique({where:{tenantId:appointment.tenantId}});if(row?.isActive)return {apiUrl:row.apiUrl,apiKey:decryptIntegrationSecret(row.apiKeyEncrypted),campaignPaymentPending:row.campaignPaymentPending,campaignPaymentSuccess:row.campaignPaymentSuccess,campaignCancelled:row.campaignCancelled,campaignRescheduled:row.campaignRescheduled};if(!row&&appointment.clinicName.trim().toLowerCase().includes("demo clinic")&&config.AISENSY_API_KEY)return {apiUrl:config.AISENSY_API_URL,apiKey:config.AISENSY_API_KEY,campaignPaymentPending:config.AISENSY_CAMPAIGN_PAYMENT_PENDING||"",campaignPaymentSuccess:config.AISENSY_CAMPAIGN_PAYMENT_SUCCESS||"",campaignCancelled:config.AISENSY_CAMPAIGN_CANCELLED||"",campaignRescheduled:config.AISENSY_CAMPAIGN_RESCHEDULED||""};return null;}
async function sendCampaign(campaign:(settings:AiSensySettings)=>string, appointment: AppointmentMessage, templateParams: string[], media?: { url: string; filename: string }) {
  const settings=await tenantSettings(appointment),campaignName=settings&&campaign(settings);
  if (!settings || !campaignName) return { sent:false, skipped:true, reason:"AiSensy is not configured for this clinic" };
  const response=await fetch(settings.apiUrl,{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(10000),body:JSON.stringify({apiKey:settings.apiKey,campaignName,destination:whatsappNumber(appointment.patientMobile),userName:appointment.patientName,source:"CareFlow360 CRM",templateParams,...(media?{media}:{})})});
  const responseText=await response.text();
  if(!response.ok)throw new Error(`AiSensy returned ${response.status}: ${responseText.slice(0,500)}`);
  return {sent:true,status:response.status,response:responseText.slice(0,500)};
}
export const paymentLinkFor=(appointmentNumber:string)=>`${config.APP_URL.replace(/\/$/,"")}/payment/${encodeURIComponent(appointmentNumber)}`;
export function appointmentToken(doctorName:string,departmentName:string,departmentCode:string,startsAt:Date,serialNumber:number){const name=doctorName.replace(/^dr\.?\s*/i,"").trim().split(/\s+/),initials=`${name[0]?.[0]||"D"}${name.length>1?name[name.length-1][0]:"R"}`.toUpperCase(),localDate=startsAt.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"}),datePart=`${Number(localDate.slice(8,10))}-${localDate.slice(5,7)}`,specialty=departmentName.replace(/[^a-z]/gi,"").slice(0,5).toUpperCase()||departmentCode.toUpperCase();return `${initials}-${specialty}/${datePart}/${String(serialNumber).padStart(2,"0")}`;}
export const tokenImageSignature=(appointmentId:string)=>createHmac("sha256",config.JWT_SECRET).update(`appointment-token:${appointmentId}`).digest("hex");
export function validTokenImageSignature(appointmentId:string,signature:string){const expected=Buffer.from(tokenImageSignature(appointmentId),"hex"),supplied=Buffer.from(signature,"hex");return expected.length===supplied.length&&timingSafeEqual(expected,supplied);}
export const tokenImageUrlFor=(appointmentId:string)=>`${config.APP_URL.replace(/\/$/,"")}/api/public/appointment-token/${appointmentId}.png?signature=${tokenImageSignature(appointmentId)}`;
export const sendPaymentPendingMessage=(a:AppointmentMessage,paymentUrl=paymentLinkFor(a.appointmentNumber))=>sendCampaign(s=>s.campaignPaymentPending,a,[a.patientName,a.clinicName,a.doctorName,a.departmentName,indiaDate(a.startsAt),indiaTime(a.startsAt),String(a.amount),paymentUrl]);
export const sendPaymentSuccessMessage=(a:AppointmentMessage)=>sendCampaign(s=>s.campaignPaymentSuccess,a,[a.patientName,a.clinicName,a.doctorName,a.departmentName,indiaDate(a.startsAt),indiaTime(a.startsAt),a.token||"Not generated",String(a.amount)],{url:tokenImageUrlFor(a.appointmentId),filename:`${a.token||a.appointmentNumber}.png`});
export const sendCancelledMessage=(a:AppointmentMessage,cancellationReason:string)=>sendCampaign(s=>s.campaignCancelled,a,[a.patientName,a.clinicName,a.doctorName,a.departmentName,indiaDate(a.startsAt),indiaTime(a.startsAt),a.token||"Not generated",cancellationReason,a.clinicPhone]);
export const sendRescheduledMessage=(a:AppointmentMessage,previousStartsAt:Date)=>sendCampaign(s=>s.campaignRescheduled,a,[a.patientName,a.clinicName,a.doctorName,a.departmentName,indiaDate(previousStartsAt),indiaTime(previousStartsAt),indiaDate(a.startsAt),indiaTime(a.startsAt),a.token||"Pending payment",a.clinicPhone]);
