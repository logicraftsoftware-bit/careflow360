import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, PhoneCall, Save } from "lucide-react";
import { api, unwrap } from "../api";

const defaults={accountSid:"",apiKey:"",apiToken:"",exophone:"",region:"MUMBAI",isActive:true};

export function ExotelIntegrationsPage(){
  const client=useQueryClient();
  const {data:tenants=[],isLoading,error}=useQuery({queryKey:["admin-exotel-integrations"],queryFn:()=>api.get("/super-admin/exotel-integrations").then(unwrap)});
  const [tenantId,setTenantId]=useState(""),[form,setForm]=useState(defaults);
  const selected=useMemo(()=>tenants.find((tenant:any)=>tenant.id===tenantId),[tenants,tenantId]);
  useEffect(()=>{if(!tenantId&&tenants.length)setTenantId(tenants[0].id)},[tenants,tenantId]);
  useEffect(()=>{if(selected)setForm({...defaults,...(selected.integration||{}),apiKey:"",apiToken:""})},[selected]);
  const save=useMutation({mutationFn:()=>api.put(`/super-admin/tenants/${tenantId}/exotel`,form),onSuccess:async()=>client.invalidateQueries({queryKey:["admin-exotel-integrations"]})});
  const field=(name:keyof typeof defaults,value:string|boolean)=>setForm(current=>({...current,[name]:value}));
  const voiceHost=form.region==="MUMBAI"?"https://api.in.exotel.com":"https://api.exotel.com";
  const ccmHost=form.region==="MUMBAI"?"https://ccm-api.in.exotel.com":"https://ccm-api.exotel.com";
  return <><div className="page-head"><div><span>SAAS INTEGRATIONS</span><h1>Exotel Voice</h1><p>Configure isolated Exotel voice credentials for each clinic.</p></div></div><div className="integration-layout">
    <aside className="panel clinic-picker"><h3>Clinics</h3><p>Select the clinic whose Exotel account you want to configure.</p>{isLoading?<div className="state">Loading clinics…</div>:error?<div className="alert error">{(error as any).response?.data?.message||"Unable to load clinics"}</div>:tenants.length?tenants.map((tenant:any)=><button type="button" className={tenant.id===tenantId?"active":""} key={tenant.id} onClick={()=>setTenantId(tenant.id)}><span>{tenant.name}<small>{tenant.email}</small></span>{tenant.integration?.isActive&&<CheckCircle2/>}</button>):<div className="state">No clinics found.</div>}</aside>
    {selected&&<form className="panel integration-form" onSubmit={event=>{event.preventDefault();save.mutate()}}><div className="integration-title exotel-title"><PhoneCall/><div><h2>{selected.name}</h2><p>{selected.integration?"Exotel is configured for this clinic.":"Add this clinic's own Exotel credentials."}</p></div><label className="toggle-label"><input type="checkbox" checked={form.isActive} onChange={event=>field("isActive",event.target.checked)}/> Active</label></div><div className="integration-grid">
      <label><span>Account SID</span><input required value={form.accountSid} placeholder="Exotel account SID" onChange={event=>field("accountSid",event.target.value)}/></label>
      <label><span>ExoPhone / Caller ID</span><input required value={form.exophone} placeholder="Your Exotel virtual number" onChange={event=>field("exophone",event.target.value)}/></label>
      <label className="wide"><span><KeyRound/> API key</span><input type="password" required={!selected.integration?.hasApiKey} value={form.apiKey} placeholder={selected.integration?.hasApiKey?"Saved securely — leave blank to keep it":"Paste this clinic's Exotel API key"} autoComplete="new-password" onChange={event=>field("apiKey",event.target.value)}/><small>The saved key is encrypted and is never shown again.</small></label>
      <label className="wide"><span><KeyRound/> API token</span><input type="password" required={!selected.integration?.hasApiToken} value={form.apiToken} placeholder={selected.integration?.hasApiToken?"Saved securely — leave blank to keep it":"Paste this clinic's Exotel API token"} autoComplete="new-password" onChange={event=>field("apiToken",event.target.value)}/><small>The saved token is encrypted and is never shown again.</small></label>
      <label><span>Account region</span><select value={form.region} onChange={event=>field("region",event.target.value)}><option value="MUMBAI">Mumbai (India)</option><option value="SINGAPORE">Singapore</option></select></label>
      <div className="exotel-hosts"><small>Voice API host</small><code>{voiceHost}</code><small>CCM API host</small><code>{ccmHost}</code></div>
    </div>{save.isSuccess&&<div className="alert settings-success">Exotel configuration saved for {selected.name}.</div>}{save.error&&<div className="alert error">{(save.error as any).response?.data?.message||"Unable to save Exotel configuration"}</div>}<div className="modal-actions"><button className="btn" disabled={save.isPending}><Save/>{save.isPending?"Saving…":"Save integration"}</button></div></form>}
  </div></>;
}
