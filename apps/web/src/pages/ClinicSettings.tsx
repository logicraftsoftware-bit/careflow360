import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, MapPin, Phone, Save } from "lucide-react";
import { api, unwrap } from "../api";

export function ClinicSettingsPage() {
  const client = useQueryClient();
  const { data: profile, isLoading, error } = useQuery({ queryKey: ["clinic-profile"], queryFn: () => api.get("/crm/clinic-profile").then(unwrap) });
  const [name, setName] = useState(""), [mobile, setMobile] = useState(""), [address, setAddress] = useState(""), [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => { if (profile) { setName(profile.name || ""); setMobile(profile.mobile || ""); setAddress(profile.address || ""); setLogoUrl(profile.logoUrl || null); } }, [profile]);
  const save = useMutation({ mutationFn: () => api.patch("/crm/clinic-profile", { name, mobile, address, logoUrl }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["clinic-profile"] }); } });
  const chooseLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) return window.alert("Choose a PNG, JPEG, or WebP image");
    if (file.size > 1_000_000) return window.alert("Logo must be smaller than 1 MB");
    const reader = new FileReader(); reader.onload = () => setLogoUrl(String(reader.result)); reader.readAsDataURL(file);
  };
  if (isLoading) return <div className="state">Loading clinic settings…</div>;
  if (error) return <div className="state error">Unable to load clinic settings</div>;
  return <><div className="page-head"><div><span>CLINIC MANAGEMENT</span><h1>Settings</h1><p>Manage the identity displayed across your clinic workspace.</p></div></div><form className="panel clinic-settings" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}><div className="clinic-logo-editor"><div className="clinic-logo-preview">{logoUrl ? <img src={logoUrl} alt="Clinic logo" /> : <Building2 />}</div><div><h2>Clinic logo</h2><p>PNG, JPEG or WebP, maximum 1 MB.</p><label className="btn ghost"><ImagePlus /> Choose logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseLogo(event.target.files?.[0])} /></label>{logoUrl && <button type="button" className="link-danger" onClick={() => setLogoUrl(null)}>Remove logo</button>}</div></div><div className="clinic-settings-grid"><label><span><Building2 /> Clinic name</span><input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><label><span><Phone /> Phone number</span><input required minLength={8} maxLength={20} value={mobile} onChange={(event) => setMobile(event.target.value)} /></label><label className="wide"><span><MapPin /> Address</span><textarea required minLength={3} maxLength={500} rows={4} value={address} onChange={(event) => setAddress(event.target.value)} /></label></div>{save.isSuccess && <div className="alert settings-success">Clinic settings saved successfully.</div>}{save.error && <div className="alert error">{(save.error as any).response?.data?.message || "Unable to save clinic settings"}</div>}<div className="modal-actions"><button className="btn" disabled={save.isPending}><Save /> {save.isPending ? "Saving…" : "Save settings"}</button></div></form></>;
}
