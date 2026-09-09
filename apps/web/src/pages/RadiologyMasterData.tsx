import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ScanLine, Search, Trash2, X } from "lucide-react";
import { api, unwrap } from "../api";

type Field = { name: string; label: string; type?: "text" | "number" | "textarea" | "select"; required?: boolean; options?: string[] };
type Row = { id: string; title: string; status: string; data?: Record<string, unknown> } & Record<string, unknown>;
type Section = { label: string; singular: string; module: string; description: string; fields: Field[]; columns: string[] };

const sections: Section[] = [
  { label: "Radiology Test", singular: "Radiology Test", module: "radiology-tests", description: "Manage imaging tests, modalities, pricing and reporting time.", fields: [
    { name: "title", label: "Test name", required: true }, { name: "code", label: "Test code", required: true }, { name: "category", label: "Radiology category", type: "select", required: true },
    { name: "modality", label: "Modality", type: "select", options: ["X-RAY", "ULTRASOUND", "CT", "MRI", "MAMMOGRAPHY", "DEXA", "DOPPLER"], required: true },
    { name: "bodyPart", label: "Body part", required: true }, { name: "durationMinutes", label: "Duration (minutes)", type: "number" }, { name: "reportingHours", label: "Reporting time (hours)", type: "number" },
    { name: "price", label: "Price", type: "number", required: true }, { name: "preparation", label: "Patient preparation", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "code", "category", "modality", "bodyPart", "price", "status"] },
  { label: "Radiology Category", singular: "Radiology Category", module: "radiology-categories", description: "Maintain reusable categories for imaging tests.", fields: [
    { name: "title", label: "Category name", required: true }, { name: "code", label: "Category code", required: true }, { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "code", "description", "status"] },
  { label: "Unit", singular: "Unit", module: "radiology-units", description: "Maintain measurement units used in radiology findings.", fields: [
    { name: "title", label: "Unit name", required: true }, { name: "symbol", label: "Symbol", required: true }, { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "symbol", "description", "status"] },
  { label: "Radiology Parameter", singular: "Radiology Parameter", module: "radiology-parameters", description: "Configure test-wise imaging observations and normal ranges.", fields: [
    { name: "title", label: "Parameter name", required: true }, { name: "testName", label: "Radiology test", type: "select", required: true }, { name: "referenceFrom", label: "Reference from" }, { name: "referenceTo", label: "Reference to" },
    { name: "unit", label: "Unit", type: "select", required: true }, { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "testName", "referenceFrom", "referenceTo", "unit", "description", "status"] },
];

const tests = [
  ["Chest X-Ray PA View", "XR-CHEST-PA", "X-Ray", "X-RAY", "Chest", 10, 4, 500], ["Chest X-Ray AP View", "XR-CHEST-AP", "X-Ray", "X-RAY", "Chest", 10, 4, 500],
  ["X-Ray Abdomen", "XR-ABD", "X-Ray", "X-RAY", "Abdomen", 10, 4, 600], ["X-Ray Pelvis", "XR-PELVIS", "X-Ray", "X-RAY", "Pelvis", 10, 4, 600],
  ["X-Ray Knee", "XR-KNEE", "X-Ray", "X-RAY", "Knee", 10, 4, 550], ["X-Ray Spine", "XR-SPINE", "X-Ray", "X-RAY", "Spine", 15, 6, 800],
  ["Ultrasound Whole Abdomen", "USG-WA", "Ultrasound", "ULTRASOUND", "Abdomen", 25, 6, 1200], ["Ultrasound Pelvis", "USG-PELVIS", "Ultrasound", "ULTRASOUND", "Pelvis", 20, 6, 1000],
  ["Obstetric Ultrasound", "USG-OBS", "Ultrasound", "ULTRASOUND", "Pelvis", 25, 6, 1500], ["Thyroid Ultrasound", "USG-THYROID", "Ultrasound", "ULTRASOUND", "Neck", 20, 6, 1200],
  ["CT Brain Plain", "CT-BRAIN", "CT Scan", "CT", "Brain", 20, 8, 2500], ["CT Chest", "CT-CHEST", "CT Scan", "CT", "Chest", 25, 12, 4000],
  ["CT Whole Abdomen", "CT-ABD", "CT Scan", "CT", "Abdomen", 30, 12, 5000], ["MRI Brain", "MRI-BRAIN", "MRI", "MRI", "Brain", 40, 24, 6000],
  ["MRI Spine", "MRI-SPINE", "MRI", "MRI", "Spine", 45, 24, 7000], ["MRI Knee", "MRI-KNEE", "MRI", "MRI", "Knee", 40, 24, 6000],
  ["Digital Mammography", "MAMMO", "Mammography", "MAMMOGRAPHY", "Breast", 25, 12, 2000], ["DEXA Bone Density", "DEXA", "Bone Density", "DEXA", "Hip and Spine", 20, 6, 1800],
  ["Carotid Doppler", "DOP-CAROTID", "Doppler", "DOPPLER", "Neck", 30, 8, 2500], ["Venous Doppler Lower Limb", "DOP-LEG", "Doppler", "DOPPLER", "Lower Limb", 30, 8, 2500],
] as const;
const categories = ["X-Ray", "Ultrasound", "CT Scan", "MRI", "Mammography", "Bone Density", "Doppler"];
const units = [["Millimetre", "mm"], ["Centimetre", "cm"], ["Hounsfield unit", "HU"], ["Degrees", "°"], ["Percentage", "%"], ["Centimetres per second", "cm/s"], ["Beats per minute", "bpm"], ["T-score", "T-score"]] as const;
const parameters = [
  ["Cardiothoracic Ratio", "Chest X-Ray PA View", "0", "50", "%"], ["Cardiothoracic Ratio", "Chest X-Ray AP View", "0", "50", "%"], ["Bowel Diameter", "X-Ray Abdomen", "0", "3", "cm"],
  ["Joint Space", "X-Ray Knee", "3", "8", "mm"], ["Cobb Angle", "X-Ray Spine", "0", "10", "°"], ["Liver Size", "Ultrasound Whole Abdomen", "12", "15", "cm"],
  ["Spleen Size", "Ultrasound Whole Abdomen", "7", "13", "cm"], ["Common Bile Duct", "Ultrasound Whole Abdomen", "0", "6", "mm"], ["Endometrial Thickness", "Ultrasound Pelvis", "2", "16", "mm"],
  ["Fetal Heart Rate", "Obstetric Ultrasound", "110", "160", "bpm"], ["Thyroid Lobe Length", "Thyroid Ultrasound", "4", "6", "cm"], ["Midline Shift", "CT Brain Plain", "0", "0", "mm"],
  ["Lung Nodule Size", "CT Chest", "0", "6", "mm"], ["Liver Attenuation", "CT Whole Abdomen", "50", "65", "HU"], ["Ventricle Width", "MRI Brain", "0", "10", "mm"],
  ["Spinal Canal Diameter", "MRI Spine", "10", "20", "mm"], ["Meniscal Thickness", "MRI Knee", "3", "5", "mm"], ["Breast Lesion Size", "Digital Mammography", "0", "5", "mm"],
  ["Bone Density T-score", "DEXA Bone Density", "-1", "1", "T-score"], ["Peak Systolic Velocity", "Carotid Doppler", "0", "125", "cm/s"], ["Venous Diameter", "Venous Doppler Lower Limb", "2", "10", "mm"],
] as const;

const val = (row: Row, key: string) => key in row ? row[key] : row.data?.[key];
const pretty = (text: string) => text.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

export function RadiologyMasterDataPage() {
  const qc = useQueryClient(), initialized = useRef(new Set<string>());
  const [active, setActive] = useState(0), [search, setSearch] = useState(""), [editing, setEditing] = useState<Row | null>(null), [open, setOpen] = useState(false);
  const section = sections[active], endpoint = `/crm/modules/${section.module}`;
  const current = useQuery({ queryKey: [endpoint], queryFn: () => api.get(endpoint).then(unwrap) });
  const categoryQuery = useQuery({ queryKey: ["/crm/modules/radiology-categories"], queryFn: () => api.get("/crm/modules/radiology-categories").then(unwrap) });
  const unitQuery = useQuery({ queryKey: ["/crm/modules/radiology-units"], queryFn: () => api.get("/crm/modules/radiology-units").then(unwrap) });
  const testQuery = useQuery({ queryKey: ["/crm/modules/radiology-tests"], queryFn: () => api.get("/crm/modules/radiology-tests").then(unwrap) });
  const parameterQuery = useQuery({ queryKey: ["/crm/modules/radiology-parameters"], queryFn: () => api.get("/crm/modules/radiology-parameters").then(unwrap) });
  const rows: Row[] = current.data?.items || [], categoryRows: Row[] = categoryQuery.data?.items || [], unitRows: Row[] = unitQuery.data?.items || [], testRows: Row[] = testQuery.data?.items || [], parameterRows: Row[] = parameterQuery.data?.items || [];
  const initialize = (module: string, ready: boolean, records: object[]) => {
    if (!ready || initialized.current.has(module) || !records.length) return;
    initialized.current.add(module);
    Promise.all(records.map((record) => api.post(`/crm/modules/${module}`, record))).then(() => qc.invalidateQueries({ queryKey: [`/crm/modules/${module}`] })).catch(() => initialized.current.delete(module));
  };
  useEffect(() => initialize("radiology-categories", !!categoryQuery.data && !categoryRows.length, categories.map((title) => ({ title, code: title.toUpperCase().replace(/[^A-Z]+/g, "_"), status: "ACTIVE" }))), [categoryQuery.data, categoryRows.length]);
  useEffect(() => initialize("radiology-units", !!unitQuery.data && !unitRows.length, units.map(([title, symbol]) => ({ title, symbol, status: "ACTIVE" }))), [unitQuery.data, unitRows.length]);
  useEffect(() => initialize("radiology-tests", !!testQuery.data && !testRows.length, tests.map(([title, code, category, modality, bodyPart, durationMinutes, reportingHours, price]) => ({ title, code, category, modality, bodyPart, durationMinutes, reportingHours, price, status: "ACTIVE" }))), [testQuery.data, testRows.length]);
  useEffect(() => initialize("radiology-parameters", !!parameterQuery.data && !parameterRows.length && !!testRows.length && !!unitRows.length, parameters.map(([title, testName, referenceFrom, referenceTo, unit]) => ({ title, testName, referenceFrom, referenceTo, unit, status: "ACTIVE" }))), [parameterQuery.data, parameterRows.length, testRows.length, unitRows.length]);
  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const save = useMutation({ mutationFn: (payload: Record<string, FormDataEntryValue>) => editing ? api.patch(`${endpoint}/${editing.id}`, payload) : api.post(endpoint, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: [endpoint] }); setOpen(false); setEditing(null); } });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`${endpoint}/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: [endpoint] }) });
  const options = (field: Field) => field.options || (field.name === "category" ? categoryRows.map((row) => row.title) : field.name === "unit" ? unitRows.map((row) => String(val(row, "symbol") || row.title)) : field.name === "testName" ? testRows.map((row) => row.title) : []);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate(Object.fromEntries(new FormData(event.currentTarget))); };
  return <div className="lab-layout"><aside className="lab-menu panel">{sections.map((item, index) => <button key={item.module} className={active === index ? "active" : ""} onClick={() => { setActive(index); setSearch(""); }}>{item.label}</button>)}</aside><section className="lab-content panel">
    <header className="lab-head"><div><span>RADIOLOGY</span><h1>{section.label}</h1><p>{section.description}</p></div><button className="btn" onClick={() => { setEditing(null); setOpen(true); }}><Plus/> Add {section.singular}</button></header>
    <div className="lab-toolbar"><div className="search"><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${section.label.toLowerCase()}...`}/></div><small>{filtered.length} record{filtered.length === 1 ? "" : "s"}</small></div>
    {current.isLoading ? <div className="state">Loading…</div> : current.error ? <div className="state error">Unable to load radiology data.</div> : <div className="table-wrap"><table><thead><tr>{section.columns.map((column) => <th key={column}>{pretty(column)}</th>)}<th>Actions</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}>{section.columns.map((column) => <td key={column}>{column === "status" ? <span className="status-pill">{String(val(row, column) || "ACTIVE")}</span> : String(val(row, column) ?? "—")}</td>)}<td><div className="row-actions"><button onClick={() => { setEditing(row); setOpen(true); }}><Pencil/></button><button className="danger" onClick={() => confirm(`Delete this ${section.singular.toLowerCase()}?`) && remove.mutate(row.id)}><Trash2/></button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><ScanLine/><p>No {section.label.toLowerCase()} found.</p></div>}</div>}
  </section>{open && <div className="modal-bg"><form className="modal lab-modal" onSubmit={submit}><div className="modal-head"><div><h2>{editing ? "Edit" : "Add"} {section.singular}</h2><p>Enter the details below.</p></div><button type="button" className="icon" onClick={() => setOpen(false)}><X/></button></div><div className="modal-grid">{section.fields.map((field) => { const list = options(field), currentValue = String(val(editing || {} as Row, field.name) || list[0] || ""); return <label key={field.name} className={field.type === "textarea" ? "wide" : ""}>{field.label}{field.type === "textarea" ? <textarea name={field.name} defaultValue={currentValue}/> : field.type === "select" ? <select name={field.name} required={field.required} defaultValue={currentValue}>{!list.length && <option value="">Add a master record first</option>}{list.map((item) => <option key={item} value={item}>{field.options ? pretty(item.toLowerCase()) : item}</option>)}</select> : <input name={field.name} type={field.type || "text"} required={field.required} min={field.type === "number" ? 0 : undefined} step={field.name === "price" ? ".01" : undefined} defaultValue={currentValue}/>}</label>; })}</div><div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn" disabled={save.isPending}>{save.isPending ? "Saving…" : `Save ${section.singular}`}</button></div></form></div>}</div>;
}
