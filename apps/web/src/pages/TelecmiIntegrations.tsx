import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, PhoneCall, Save } from "lucide-react";
import { api, unwrap } from "../api";

const defaults={appId:"",appSecret:"",businessNumber:"",apiUrl:"https://piopiy.telecmi.com/v1",webhookUrl:"",isTestMode:false,isActive:true};

export function TelecmiIntegrationsPage(){
  const client=useQueryClient();
  const {data:tenants=[],isLoading,error}=useQuery({queryKey:["admin-telecmi-integrations"],queryFn:()=>api.get("/super-admin/telecmi-integrations").then(unwrap)});
  const [tenantId,setTenantId]=useState(""),[form,setForm]=useState(defaults);
  const selected=useMemo(()=>tenants.find((tenant:any)=>tenant.id===tenantId),[tenants,tenantId]);
  useEffect(()=>{if(!tenantId&&tenants.length)setTenantId(tenants[0].id)},[tenants,tenantId]);
  useEffect(()=>{if(selected)setForm({...defaults,...(selected.integration||{}),appSecret:""})},[selected]);
  const save=useMutation({mutationFn:()=>api.put(`/super-admin/tenants/${tenantId}/telecmi`,form),onSuccess:async()=>client.invalidateQueries({queryKey:["admin-telecmi-integrations"]})});
  const field=(name:keyof typeof defaults,value:string|boolean)=>setForm(current=>({...current,[name]:value}));
  return <><div className="page-head"><div><span>SAAS INTEGRATIONS</span><h1>TeleCMI Voice</h1><p>Configure isolated TeleCMI application credentials for each clinic.</p></div></div><div className="integration-layout">
    <aside className="panel clinic-picker"><h3>Clinics</h3><p>Select the clinic whose TeleCMI account you want to configure.</p>{isLoading?<div className="state">Loading clinics…</div>:error?<div className="alert error">{(error as any).response?.data?.message||"Unable to load clinics"}</div>:tenants.length?tenants.map((tenant:any)=><button type="button" className={tenant.id===tenantId?"active":""} key={tenant.id} onClick={()=>setTenantId(tenant.id)}><span>{tenant.name}<small>{tenant.email}</small></span>{tenant.integration?.isActive&&<CheckCircle2/>}</button>):<div className="state">No clinics found.</div>}</aside>
    {selected&&<form className="panel integration-form" onSubmit={event=>{event.preventDefault();save.mutate()}}><div className="integration-title"><PhoneCall/><div><h2>{selected.name}</h2><p>{selected.integration?"TeleCMI is configured for this clinic.":"Add this clinic's TeleCMI App ID and App Secret."}</p></div><label className="toggle-label"><input type="checkbox" checked={form.isActive} onChange={event=>field("isActive",event.target.checked)}/> Active</label></div><div className="integration-grid">
      <label><span>App ID</span><input required value={form.appId} placeholder="TeleCMI App ID" onChange={event=>field("appId",event.target.value)}/></label>
      <label><span>Business number</span><input required value={form.businessNumber} placeholder="TeleCMI business / virtual number" onChange={event=>field("businessNumber",event.target.value)}/></label>
      <label className="wide"><span><KeyRound/> App Secret</span><input type="password" required={!selected.integration?.hasAppSecret} value={form.appSecret} placeholder={selected.integration?.hasAppSecret?"Saved securely — leave blank to keep it":"Paste this clinic's TeleCMI App Secret"} autoComplete="new-password" onChange={event=>field("appSecret",event.target.value)}/><small>The App Secret is encrypted and is never returned to the browser.</small></label>
      <label className="wide"><span>TeleCMI API URL</span><input type="url" required value={form.apiUrl} onChange={event=>field("apiUrl",event.target.value)}/></label>
      <label className="wide"><span>Webhook URL (optional)</span><input type="url" value={form.webhookUrl} placeholder="https://crm.example.com/api/webhooks/telecmi" onChange={event=>field("webhookUrl",event.target.value)}/><small>This will be used in the next phase for call status and recording events.</small></label>
      <label className="toggle-label"><input type="checkbox" checked={form.isTestMode} onChange={event=>field("isTestMode",event.target.checked)}/> Test mode</label>
    </div>{save.isSuccess&&<div className="alert settings-success">TeleCMI configuration saved for {selected.name}.</div>}{save.error&&<div className="alert error">{(save.error as any).response?.data?.message||"Unable to save TeleCMI configuration"}</div>}<div className="modal-actions"><button className="btn" disabled={save.isPending}><Save/>{save.isPending?"Saving…":"Save integration"}</button></div></form>}
  </div></>;
}
