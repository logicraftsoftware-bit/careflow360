import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, unwrap } from "../api";

export function TenantEditorPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({
    name: "", ownerName: "", email: "", mobile: "", password: "",
    address: "", city: "", state: "", pin: "", planId: "",
    billingCycle: "MONTHLY", status: "ACTIVE",
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["tenant-editor-plans"],
    queryFn: () => api.get("/super-admin/plans").then(unwrap),
  });
  const { data: tenant } = useQuery({
    queryKey: ["tenant-editor", id],
    queryFn: () => api.get(`/super-admin/tenants/${id}`).then(unwrap),
    enabled: editing,
  });
  useEffect(() => {
    if (!tenant) return;
    setForm((current: any) => ({
      ...current, ...tenant, password: "",
      planId: tenant.subscriptions?.[0]?.planId || "",
      billingCycle: tenant.subscriptions?.[0]?.billingCycle || "MONTHLY",
    }));
  }, [tenant]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form };
      if (!body.password) delete body.password;
      return editing
        ? api.patch(`/super-admin/tenants/${id}`, body)
        : api.post("/super-admin/tenants", body);
    },
    onSuccess: () => navigate("/admin/tenants"),
  });
  const field = (name: string) => ({
    value: form[name] || "",
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [name]: event.target.value }),
  });
  return <div className="booking-page">
    <button className="schedule-back" onClick={() => navigate("/admin/tenants")}><ArrowLeft/> Back to tenants</button>
    <div className="booking-head"><div><span>PLATFORM MANAGEMENT</span><h1>{editing ? "Edit clinic" : "Add clinic"}</h1><p>Manage clinic ownership, contact details, subscription and access status.</p></div><Building2/></div>
    <form className="panel booking-form" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <div className="booking-grid">
        <label>Clinic name *<input required {...field("name")}/></label>
        <label>Owner name *<input required {...field("ownerName")}/></label>
        <label>Owner email *<input required type="email" {...field("email")}/></label>
        <label>Mobile *<input required {...field("mobile")}/></label>
        <label>{editing ? "New password (optional)" : "Owner password *"}<input required={!editing} minLength={8} type="password" {...field("password")}/></label>
        <label>Plan *<select required {...field("planId")}><option value="">Select plan</option>{(plans as any[]).map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label>Billing cycle<select {...field("billingCycle")}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></label>
        <label>Status<select {...field("status")}><option value="ACTIVE">Active</option><option value="TRIAL">Trial</option><option value="PENDING_APPROVAL">Pending approval</option><option value="SUSPENDED">Suspended</option><option value="REJECTED">Rejected</option></select></label>
        <div className="wide"><label>Address<textarea {...field("address")}/></label></div>
        <label>City<input {...field("city")}/></label><label>State<input {...field("state")}/></label><label>PIN<input {...field("pin")}/></label>
      </div>
      {save.error && <div className="alert error">{(save.error as any).response?.data?.message || "Unable to save clinic"}</div>}
      <div className="booking-actions"><button type="button" className="btn ghost" onClick={() => navigate("/admin/tenants")}>Cancel</button><button className="btn" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save clinic"}</button></div>
    </form>
  </div>;
}
