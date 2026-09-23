import { useEffect,useMemo,useState } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { CheckCircle2,Database,KeyRound,RefreshCw,Save } from "lucide-react";
import { api,unwrap } from "../api";

const defaults={baseUrl:"https://erp.hosmedai.com",apiKey:"",timeoutMs:30000,isActive:true};
export function ErpIntegrationsPage(){
  const client=useQueryClient(),{data:tenants=[],isLoading,error}=useQuery({queryKey:["admin-erp-integrations"],queryFn:()=>api.get("/super-admin/erp-integrations").then(unwrap)});
  const[tenantId,setTenantId]=useState(""),[form,setForm]=useState(defaults),selected=useMemo(()=>tenants.find((x:any)=>x.id===tenantId),[tenants,tenantId]);
  useEffect(()=>{if(!tenantId&&tenants.length)setTenantId(tenants[0].id)},[tenants,tenantId]);
  useEffect(()=>{if(selected)setForm({...defaults,...(selected.integration||{}),apiKey:""})},[selected]);
  const refresh=()=>client.invalidateQueries({queryKey:["admin-erp-integrations"]});
  const save=useMutation({mutationFn:()=>api.put(`/super-admin/tenants/${tenantId}/erp-integration`,form),onSuccess:refresh});
  const sync=useMutation({mutationFn:()=>api.post(`/super-admin/tenants/${tenantId}/erp-sync`),onSuccess:refresh,onError:refresh});
  const field=(name:keyof typeof defaults,value:string|number|boolean)=>setForm(current=>({...current,[name]:value}));
  const integration=selected?.integration;
  return <><div className="page-head"><div><span>SAAS INTEGRATIONS</span><h1>Hospital ERP</h1><p>Connect each CareFlow360 clinic to its hospital ERP without changing code.</p></div></div><div className="integration-layout">
    <aside className="panel clinic-picker"><h3>Clinics</h3><p>Select the clinic whose ERP connection you want to manage.</p>{isLoading?<div className="state">Loading clinics…</div>:error?<div className="alert error">Unable to load clinics</div>:tenants.map((tenant:any)=><button type="button" className={tenant.id===tenantId?"active":""} key={tenant.id} onClick={()=>setTenantId(tenant.id)}><span>{tenant.name}<small>{tenant.email}</small></span>{tenant.integration?.isActive&&<CheckCircle2/>}</button>)}</aside>
    {selected&&<form className="panel integration-form" onSubmit={event=>{event.preventDefault();save.mutate()}}><div className="integration-title"><Database/><div><h2>{selected.name}</h2><p>{integration?"ERP connection configured for this clinic.":"Enter the connection issued by the ERP Super Admin."}</p></div><label className="toggle-label"><input type="checkbox" checked={form.isActive} onChange={e=>field("isActive",e.target.checked)}/> Active</label></div><div className="integration-grid">
      <label className="wide"><span>ERP base URL</span><input required type="url" value={form.baseUrl} onChange={e=>field("baseUrl",e.target.value)} placeholder="https://erp.example.com"/></label>
      <label className="wide"><span><KeyRound/> ERP API key</span><input type="password" required={!integration?.hasApiKey} value={form.apiKey} autoComplete="new-password" onChange={e=>field("apiKey",e.target.value)} placeholder={integration?.hasApiKey?"Saved securely — leave blank to keep it":"Paste the newly generated ERP key"}/><small>The saved key is encrypted and is never returned to the browser.</small></label>
      <label><span>Request timeout (ms)</span><input required type="number" min={1000} max={120000} value={form.timeoutMs} onChange={e=>field("timeoutMs",Number(e.target.value))}/></label>
    </div>
    {integration&&<div className="panel" style={{marginTop:16}}><strong>Synchronization status</strong><p>Last result: {integration.lastResult||"Never synced"}</p><p>Last success: {integration.lastSuccessAt?new Date(integration.lastSuccessAt).toLocaleString():"Never"}</p>{integration.lastCounts&&<p>Imported: {Object.entries(integration.lastCounts).map(([key,value])=>`${key} ${value}`).join(" · ")}</p>}{integration.lastError&&<div className="alert error">{integration.lastError}</div>}</div>}
    {save.isSuccess&&<div className="alert settings-success">ERP configuration saved.</div>}{save.error&&<div className="alert error">{(save.error as any).response?.data?.message||"Unable to save ERP configuration"}</div>}{sync.isSuccess&&<div className="alert settings-success">ERP synchronization completed.</div>}{sync.error&&<div className="alert error">{(sync.error as any).response?.data?.message||"ERP synchronization failed"}</div>}
    <div className="modal-actions"><button type="button" className="btn ghost" disabled={!integration||sync.isPending||integration?.inProgress} onClick={()=>sync.mutate()}><RefreshCw/>{sync.isPending||integration?.inProgress?"Syncing…":"Sync now"}</button><button className="btn" disabled={save.isPending}><Save/>{save.isPending?"Saving…":"Save integration"}</button></div></form>}
  </div></>;
}
