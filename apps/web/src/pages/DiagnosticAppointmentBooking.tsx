import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical, Plus, ScanLine, Search, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, unwrap } from "../api";

type Kind = "lab" | "radiology";
type Patient = { id: string; name: string; mobile?: string; patientNumber?: string };
type Test = { id: string; title: string; data?: { code?: string; price?: number } };
type Technician = { id: string; name: string; mobile?: string };
type Specimen = { tubeType: string; sampleType: string };
type TubeMaster = { id: string; title: string; status: string; data?: { sampleType?: string; code?: string; capColor?: string; volume?: string } };

export function DiagnosticAppointmentBookingPage({ kind }: { kind: Kind }) {
  const nav = useNavigate(), { id } = useParams(), editing = Boolean(id), isLab = kind === "lab", label = isLab ? "Lab" : "Radiology";
  const [patientSearch, setPatientSearch] = useState(""), [patient, setPatient] = useState<Patient | null>(null), [patientOpen, setPatientOpen] = useState(false);
  const [testSearch, setTestSearch] = useState(""), [testOpen, setTestOpen] = useState(false), [selected, setSelected] = useState<Test[]>([]);
  const [discount, setDiscount] = useState(0), [specimens, setSpecimens] = useState<Specimen[]>([{ tubeType: "SST Gold-Top Tube", sampleType: "Serum" }]);
  const { data: patientData } = useQuery({ queryKey: ["booking-patients"], queryFn: () => api.get("/crm/patients?limit=100").then(unwrap) });
  const { data: testData } = useQuery({ queryKey: [`${kind}-booking-tests`], queryFn: () => api.get(`/crm/modules/${kind}-tests?limit=100`).then(unwrap) });
  const { data: technicians = [] } = useQuery<Technician[]>({ queryKey: ["lab-technicians"], queryFn: () => api.get("/crm/lab-technicians").then(unwrap), enabled: isLab });
  const { data: tubeData } = useQuery({ queryKey: ["specimen-tube-master"], queryFn: () => api.get("/crm/modules/specimen-tubes").then(unwrap), enabled: isLab });
  const { data: orderData, isLoading: orderLoading } = useQuery({ queryKey: [kind, "appointment-edit", id], queryFn: () => api.get(`/crm/modules/${kind}-appointments`).then(unwrap), enabled: editing });
  const order = orderData?.items?.find((item: any) => item.id === id), orderValues = order?.data || {};
  const tubeOptions: TubeMaster[] = (tubeData?.items || []).filter((item: TubeMaster) => item.status === "ACTIVE");
  const patients: Patient[] = patientData?.items || [], tests: Test[] = testData?.items || [];
  const patientMatches = patients.filter((item) => [item.name, item.mobile, item.patientNumber].some((value) => String(value || "").toLowerCase().includes(patientSearch.toLowerCase()))).slice(0, 10);
  const testMatches = tests.filter((item) => !selected.some((chosen) => chosen.id === item.id) && [item.title, item.data?.code].some((value) => String(value || "").toLowerCase().includes(testSearch.toLowerCase()))).slice(0, 12);
  const subtotal = useMemo(() => selected.reduce((sum, test) => sum + Number(test.data?.price || 0), 0), [selected]);
  const total = Math.max(0, subtotal - Number(discount || 0));
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => editing
      ? api.patch(isLab ? `/crm/lab-collections/orders/${id}` : `/crm/modules/radiology-appointments/${id}`, payload)
      : api.post(isLab ? "/crm/lab-collections/orders" : "/crm/modules/radiology-appointments", payload),
    onSuccess: () => nav(isLab ? "/app/lab-collection/assigned" : "/app/radiology-appointments"),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!patient || !selected.length || (isLab && !specimens.length)) return;
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const common = { ...form, patientId: patient.id, testIds: selected.map((test) => test.id), testNames: selected.map((test) => test.title).join(", "), tests: selected.map((test) => ({ id: test.id, title: test.title, price: Number(test.data?.price || 0) })), subtotal, discountAmount: Number(discount || 0), amount: total, currency: "INR" };
    save.mutate(isLab ? { patientId: patient.id, appointmentAt: form.appointmentAt, technicianId: form.technicianId, testNames: common.testNames, instructions: form.instructions, priority: form.priority, paymentStatus: form.paymentStatus, subtotal, discountAmount: Number(discount || 0), amount: total, specimens: specimens.map((item) => ({ ...item, tests: selected.map((test) => test.title) })) } : { ...common, title: editing ? order.title : `RADIOLOGY-${Date.now().toString(36).toUpperCase()}` });
  };
  const selectTube = (index: number, title: string) => {
    const tube = tubeOptions.find((item) => item.title === title);
    setSpecimens((rows) => rows.map((row, position) => position === index ? { tubeType: title, sampleType: tube?.data?.sampleType || row.sampleType } : row));
  };
  useEffect(() => {
    if (!order || !patients.length || patient) return;
    const foundPatient = patients.find((item) => item.id === orderValues.patientId) || null;
    setPatient(foundPatient);
    if (foundPatient) setPatientSearch(`${foundPatient.name} · ${foundPatient.mobile || foundPatient.patientNumber || ""}`);
    setSelected(Array.isArray(orderValues.tests) ? orderValues.tests.map((test: any) => ({ id: test.id, title: test.title, data: { price: test.price } })) : []);
    setDiscount(Number(orderValues.discountAmount || 0));
    if (isLab && Array.isArray(orderValues.specimens) && orderValues.specimens.length) setSpecimens(orderValues.specimens.map((item: any) => ({ tubeType: item.tubeType, sampleType: item.sampleType })));
  }, [order, patients, patient, orderValues, isLab]);
  const localDate = (value?: string) => value ? new Date(value).toISOString().slice(0, 16) : "";
  if (editing && orderLoading) return <div className="state">Loading order…</div>;
  if (editing && !order) return <div className="state error">Order not found.</div>;

  return <div className="diagnostic-booking">
    <button className="schedule-back" onClick={() => nav(`/app/${kind}-appointments`)}><ArrowLeft /> Back to {label} Appointments</button>
    <div className="schedule-title"><div><span>CLINIC MANAGEMENT</span><h1>{editing ? "Edit" : "Create"} {label} Order</h1><p>{isLab ? "Create the order, define every specimen tube and assign a technician." : "Create and schedule a patient radiology procedure."}</p></div>{isLab ? <FlaskConical /> : <ScanLine />}</div>
    <form onSubmit={submit} className="diagnostic-booking-grid">
      <section className="panel diagnostic-form">
        <h2>Patient and appointment</h2>
        <label>Patient *</label>
        <div className="patient-search"><div className="smart-select-input"><Search /><input value={patientSearch} placeholder="Search patient name, mobile or ID" onFocus={() => setPatientOpen(true)} onBlur={() => setTimeout(() => setPatientOpen(false), 150)} onChange={(event) => { setPatientSearch(event.target.value); setPatient(null); setPatientOpen(true); }} /></div>{patientOpen && <div className="patient-results">{patientMatches.map((item) => <button type="button" key={item.id} onMouseDown={() => { setPatient(item); setPatientSearch(`${item.name} · ${item.mobile || item.patientNumber}`); setPatientOpen(false); }}><strong>{item.name}</strong><span>{item.mobile}</span><small>{item.patientNumber}</small></button>)}</div>}{patient && <small className="patient-selected">Patient selected</small>}</div>
        <div className="diagnostic-fields">
          <label>Appointment date and time *<input name="appointmentAt" type="datetime-local" required defaultValue={localDate(orderValues.appointmentAt)} /></label>
          {isLab && <label>Assigned technician *<select name="technicianId" required defaultValue={orderValues.assignedTechnicianId || ""}><option value="" disabled>Select lab technician</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label>Priority<select name="priority" defaultValue={orderValues.priority || "ROUTINE"}><option>ROUTINE</option><option>URGENT</option><option>{isLab ? "STAT" : "EMERGENCY"}</option></select></label>
          <label>Payment status<select name="paymentStatus" defaultValue={orderValues.paymentStatus || "PENDING"}><option>PENDING</option><option>PAID</option><option>PARTIALLY_PAID</option></select></label>
          <label className="wide">Instructions<textarea name="instructions" defaultValue={orderValues.instructions || ""} placeholder="Fasting, preparation or collection instructions" /></label>
        </div>
        {isLab && <div className="specimen-builder"><div className="specimen-head"><div><h2>Specimen tubes</h2><p>Select each physical tube from Specimen Tube Master. The sample type fills automatically.</p></div><button type="button" className="btn ghost" onClick={() => setSpecimens((rows) => [...rows, { tubeType: "", sampleType: "" }])}><Plus /> Add tube</button></div>{specimens.map((item, index) => <div className="specimen-row" key={index}><b>Tube {index + 1}</b><label>Tube/container type *<select required value={item.tubeType} onChange={(event) => selectTube(index, event.target.value)}><option value="" disabled>Select from master</option>{tubeOptions.map((tube) => <option key={tube.id} value={tube.title}>{tube.title}{tube.data?.capColor ? ` · ${tube.data.capColor}` : ""}{tube.data?.volume ? ` · ${tube.data.volume}` : ""}</option>)}</select></label><label>Sample type *<input required readOnly value={item.sampleType} placeholder="Filled from tube master" /></label><button type="button" disabled={specimens.length === 1} onClick={() => setSpecimens((rows) => rows.filter((_, position) => position !== index))}><Trash2 /></button></div>)}</div>}
      </section>
      <aside className="panel test-cart">
        <h2>{isLab ? "Pathology" : "Radiology"} tests</h2>
        <div className="patient-search"><div className="smart-select-input"><Search /><input value={testSearch} placeholder="Search and add tests" onFocus={() => setTestOpen(true)} onBlur={() => setTimeout(() => setTestOpen(false), 150)} onChange={(event) => { setTestSearch(event.target.value); setTestOpen(true); }} /></div>{testOpen && <div className="patient-results">{testMatches.map((test) => <button type="button" key={test.id} onMouseDown={() => { setSelected((items) => [...items, test]); setTestSearch(""); setTestOpen(false); }}><strong>{test.title}</strong><span>₹{Number(test.data?.price || 0).toLocaleString("en-IN")}</span><small>{test.data?.code}</small></button>)}</div>}</div>
        <div className="selected-tests">{selected.map((test) => <article key={test.id}><div><b>{test.title}</b><small>{test.data?.code}</small></div><strong>₹{Number(test.data?.price || 0).toLocaleString("en-IN")}</strong><button type="button" onClick={() => setSelected((items) => items.filter((item) => item.id !== test.id))}><Trash2 /></button></article>)}{!selected.length && <p>Search and add one or more tests.</p>}</div>
        <div className="booking-totals"><p><span>Subtotal</span><b>₹{subtotal.toLocaleString("en-IN")}</b></p><label>Discount amount<input type="number" min="0" max={subtotal} value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label><p className="grand-total"><span>Total payable</span><b>₹{total.toLocaleString("en-IN")}</b></p></div>
        {save.error && <div className="alert error">{(save.error as any)?.response?.data?.message || "Unable to create order."}</div>}
        <button className="btn full" disabled={!patient || !selected.length || (isLab && (!specimens.length || !technicians.length)) || save.isPending}><Plus />{save.isPending ? "Saving…" : `${editing ? "Save" : "Create"} ${label} Order`}</button>
      </aside>
    </form>
  </div>;
}
