import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Save, WalletCards } from "lucide-react";
import { api, unwrap } from "../api";

const defaults = {
  keyId: "",
  keySecret: "",
  webhookSecret: "",
  isTestMode: true,
  isActive: true,
};

export function RazorpayIntegrationsPage() {
  const client = useQueryClient();
  const { data: tenants = [], isLoading, error } = useQuery({
    queryKey: ["admin-razorpay-integrations"],
    queryFn: () => api.get("/super-admin/razorpay-integrations").then(unwrap),
  });
  const [tenantId, setTenantId] = useState("");
  const [form, setForm] = useState(defaults);
  const selected = useMemo(
    () => tenants.find((tenant: any) => tenant.id === tenantId),
    [tenants, tenantId],
  );
  useEffect(() => {
    if (!tenantId && tenants.length) setTenantId(tenants[0].id);
  }, [tenants, tenantId]);
  useEffect(() => {
    if (selected)
      setForm({
        ...defaults,
        ...(selected.integration || {}),
        keySecret: "",
        webhookSecret: "",
      });
  }, [selected]);
  const save = useMutation({
    mutationFn: () => api.put(`/super-admin/tenants/${tenantId}/razorpay`, form),
    onSuccess: async () =>
      client.invalidateQueries({ queryKey: ["admin-razorpay-integrations"] }),
  });
  const field = (name: keyof typeof defaults, value: string | boolean) =>
    setForm((current) => ({ ...current, [name]: value }));

  return <><div className="page-head"><div><span>SAAS INTEGRATIONS</span><h1>Razorpay Payments</h1><p>Configure isolated Razorpay credentials for each clinic.</p></div></div><div className="integration-layout">
    <aside className="panel clinic-picker"><h3>Clinics</h3><p>Select the clinic whose Razorpay account you want to configure.</p>{isLoading?<div className="state">Loading clinics…</div>:error?<div className="alert error">{(error as any).response?.data?.message||"Unable to load clinics"}</div>:tenants.length?tenants.map((tenant:any)=><button type="button" className={tenant.id===tenantId?"active":""} key={tenant.id} onClick={()=>setTenantId(tenant.id)}><span>{tenant.name}<small>{tenant.email}</small></span>{tenant.integration?.isActive&&<CheckCircle2/>}</button>):<div className="state">No clinics found.</div>}</aside>
    {selected&&<form className="panel integration-form" onSubmit={event=>{event.preventDefault();save.mutate()}}><div className="integration-title"><WalletCards/><div><h2>{selected.name}</h2><p>{selected.integration?"Razorpay is configured for this clinic.":"Add this clinic's own Razorpay credentials."}</p></div><label className="toggle-label"><input type="checkbox" checked={form.isActive} onChange={event=>field("isActive",event.target.checked)}/> Active</label></div><div className="integration-grid">
      <label className="wide"><span><KeyRound/> Key ID</span><input required value={form.keyId} placeholder="rzp_test_... or rzp_live_..." onChange={event=>field("keyId",event.target.value)}/></label>
      <label className="wide"><span><KeyRound/> Key Secret</span><input type="password" required={!selected.integration?.hasKeySecret} value={form.keySecret} placeholder={selected.integration?.hasKeySecret?"Saved securely — leave blank to keep it":"Paste this clinic's Razorpay Key Secret"} autoComplete="new-password" onChange={event=>field("keySecret",event.target.value)}/><small>The saved secret is encrypted and is never shown again.</small></label>
      <label className="wide"><span><KeyRound/> Webhook Secret</span><input type="password" value={form.webhookSecret} placeholder={selected.integration?.hasWebhookSecret?"Saved securely — leave blank to keep it":"Enter the webhook secret used in Razorpay"} autoComplete="new-password" onChange={event=>field("webhookSecret",event.target.value)}/><small>Required when automatic payment confirmation is enabled.</small></label>
      <label className="toggle-label wide"><input type="checkbox" checked={form.isTestMode} onChange={event=>field("isTestMode",event.target.checked)}/> Test mode</label>
    </div>{save.isSuccess&&<div className="alert settings-success">Razorpay configuration saved for {selected.name}.</div>}{save.error&&<div className="alert error">{(save.error as any).response?.data?.message||"Unable to save Razorpay configuration"}</div>}<div className="modal-actions"><button className="btn" disabled={save.isPending}><Save/>{save.isPending?"Saving…":"Save integration"}</button></div></form>}
  </div></>;
}
