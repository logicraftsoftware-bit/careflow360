import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Save, WalletCards } from "lucide-react";
import { api, unwrap } from "../api";

const defaults={appId:"",secretKey:"",isTestMode:true,isActive:true};

export function CashfreeIntegrationsPage(){
  const client=useQueryClient();
  const{data:tenants=[],isLoading,error}=useQuery({queryKey:["admin-cashfree-integrations"],queryFn:()=>api.get("/super-admin/cashfree-integrations").then(unwrap)});
  const[tenantId,setTenantId]=useState("");const[form,setForm]=useState(defaults);
  const selected=useMemo(()=>tenants.find((tenant:any)=>tenant.id===tenantId),[tenants,tenantId]);
  useEffect(()=>{if(!tenantId&&tenants.length)setTenantId(tenants[0].id)},[tenants,tenantId]);
  useEffect(()=>{if(selected)setForm({...defaults,...(selected.integration||{}),secretKey:""})},[selected]);
  const save=useMutation({mutationFn:()=>api.put(`/super-admin/tenants/${tenantId}/cashfree`,form),onSuccess:async()=>client.invalidateQueries({queryKey:["admin-cashfree-integrations"]})});
  const field=(name:keyof typeof defaults,value:string|boolean)=>setForm(current=>({...current,[name]:value}));
  return <><div className="page-head"><div><span>SAAS INTEGRATIONS</span><h1>Cashfree Payments</h1><p>Configure isolated Cashfree credentials for each clinic.</p></div></div><div className="integration-layout">
    <aside className="panel clinic-picker"><h3>Clinics</h3><p>Select the clinic whose Cashfree account you want to configure.</p>{isLoading?<div className="state">Loading clinics…</div>:error?<div className="alert error">{(error as any).response?.data?.message||"Unable to load clinics"}</div>:tenants.length?tenants.map((tenant:any)=><button type="button" className={tenant.id===tenantId?"active":""} key={tenant.id} onClick={()=>setTenantId(tenant.id)}><span>{tenant.name}<small>{tenant.email}</small></span>{tenant.integration?.isActive&&<CheckCircle2/>}</button>):<div className="state">No clinics found.</div>}</aside>
    {selected&&<form className="panel integration-form" onSubmit={event=>{event.preventDefault();save.mutate()}}><div className="integration-title"><WalletCards/><div><h2>{selected.name}</h2><p>{selected.integration?"Cashfree is configured for this clinic.":"Add this clinic's own Cashfree credentials."}</p></div><label className="toggle-label"><input type="checkbox" checked={form.isActive} onChange={event=>field("isActive",event.target.checked)}/> Active</label></div><div className="integration-grid">
      <label className="wide"><span><KeyRound/> App ID</span><input required value={form.appId} placeholder="Cashfree App ID" autoComplete="off" onChange={event=>field("appId",event.target.value)}/></label>
      <label className="wide"><span><KeyRound/> Secret Key</span><input type="password" required={!selected.integration?.hasSecretKey} value={form.secretKey} placeholder={selected.integration?.hasSecretKey?"Saved securely — leave blank to keep it":"Paste this clinic's Cashfree Secret Key"} autoComplete="new-password" onChange={event=>field("secretKey",event.target.value)}/><small>The secret is encrypted and is also used to verify Cashfree webhooks.</small></label>
      <label className="toggle-label wide"><input type="checkbox" checked={form.isTestMode} onChange={event=>field("isTestMode",event.target.checked)}/> Sandbox mode</label>
    </div>{save.isSuccess&&<div className="alert settings-success">Cashfree configuration saved for {selected.name}.</div>}{save.error&&<div className="alert error">{(save.error as any).response?.data?.message||"Unable to save Cashfree configuration"}</div>}<div className="modal-actions"><button className="btn" disabled={save.isPending}><Save/>{save.isPending?"Saving…":"Save integration"}</button></div></form>}
  </div></>;
}
