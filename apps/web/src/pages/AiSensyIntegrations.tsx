import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, MessageCircle, Save } from "lucide-react";
import { api, unwrap } from "../api";

const defaults = { apiUrl:"https://backend.aisensy.com/campaign/t1/api/v2",apiKey:"",campaignPaymentPending:"CRM Appointment Payment Pending",campaignPaymentSuccess:"CRM Appointment Token Confirmation",campaignCancelled:"CRM Appointment Cancelled",campaignRescheduled:"CRM Appointment Rescheduled",isActive:true };

export function AiSensyIntegrationsPage(){
  const client=useQueryClient();
  const {data:tenants=[],isLoading,error}=useQuery({queryKey:["admin-aisensy-integrations"],queryFn:()=>api.get("/super-admin/aisensy-integrations").then(unwrap)});
  const [tenantId,setTenantId]=useState(""),[form,setForm]=useState(defaults);
  const selected=useMemo(()=>tenants.find((tenant:any)=>tenant.id===tenantId),[tenants,tenantId]);
  useEffect(()=>{if(!tenantId&&tenants.length)setTenantId(tenants[0].id)},[tenants,tenantId]);
  useEffect(()=>{if(selected)setForm({...defaults,...(selected.integration||{}),apiKey:""})},[selected]);
  const save=useMutation({mutationFn:()=>api.put(`/super-admin/tenants/${tenantId}/aisensy`,form),onSuccess:async()=>client.invalidateQueries({queryKey:["admin-aisensy-integrations"]})});
  const field=(name:keyof typeof defaults,value:string|boolean)=>setForm(current=>({...current,[name]:value}));
  return <><div className="page-head"><div><span>SAAS INTEGRATIONS</span><h1>AiSensy WhatsApp</h1><p>Configure isolated WhatsApp credentials and campaigns for each clinic.</p></div></div><div className="integration-layout">
    <aside className="panel clinic-picker"><h3>Clinics</h3><p>Select the clinic whose AiSensy account you want to configure.</p>{isLoading?<div className="state">Loading clinics…</div>:error?<div className="alert error">{(error as any).response?.data?.message||"Unable to load clinics"}</div>:tenants.length?tenants.map((tenant:any)=><button type="button" className={tenant.id===tenantId?"active":""} key={tenant.id} onClick={()=>setTenantId(tenant.id)}><span>{tenant.name}<small>{tenant.email}</small></span>{tenant.integration?.isActive&&<CheckCircle2/>}</button>):<div className="state">No clinics found.</div>}</aside>
    {selected&&<form className="panel integration-form" onSubmit={event=>{event.preventDefault();save.mutate()}}><div className="integration-title"><MessageCircle/><div><h2>{selected.name}</h2><p>{selected.integration?"AiSensy is configured for this clinic.":"Add this clinic's own AiSensy credentials."}</p></div><label className="toggle-label"><input type="checkbox" checked={form.isActive} onChange={event=>field("isActive",event.target.checked)}/> Active</label></div><div className="integration-grid">
      <label className="wide"><span>AiSensy API URL</span><input type="url" required value={form.apiUrl} onChange={event=>field("apiUrl",event.target.value)}/></label>
      <label className="wide"><span><KeyRound/> API key</span><input type="password" required={!selected.integration?.hasApiKey} value={form.apiKey} placeholder={selected.integration?.hasApiKey?"Saved securely — leave blank to keep it":"Paste this clinic's AiSensy API key"} autoComplete="new-password" onChange={event=>field("apiKey",event.target.value)}/><small>The saved key is encrypted and is never shown again.</small></label>
      <label><span>Payment pending campaign</span><input required value={form.campaignPaymentPending} onChange={event=>field("campaignPaymentPending",event.target.value)}/></label><label><span>Payment success campaign</span><input required value={form.campaignPaymentSuccess} onChange={event=>field("campaignPaymentSuccess",event.target.value)}/></label><label><span>Cancelled campaign</span><input required value={form.campaignCancelled} onChange={event=>field("campaignCancelled",event.target.value)}/></label><label><span>Rescheduled campaign</span><input required value={form.campaignRescheduled} onChange={event=>field("campaignRescheduled",event.target.value)}/></label>
    </div>{save.isSuccess&&<div className="alert settings-success">AiSensy configuration saved for {selected.name}.</div>}{save.error&&<div className="alert error">{(save.error as any).response?.data?.message||"Unable to save AiSensy configuration"}</div>}<div className="modal-actions"><button className="btn" disabled={save.isPending}><Save/>{save.isPending?"Saving…":"Save integration"}</button></div></form>}
  </div></>;
}
