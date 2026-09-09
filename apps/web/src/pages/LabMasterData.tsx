import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, unwrap } from "../api";

type Field = { name: string; label: string; type?: "text" | "number" | "textarea" | "select"; required?: boolean; options?: string[] };
type Section = { label: string; singular: string; module: string; description: string; fields: Field[]; columns: string[] };
type Row = { id: string; title: string; status: string; data?: Record<string, unknown> } & Record<string, unknown>;

const sections: Section[] = [
  { label: "Lab Tests", singular: "Lab Test", module: "lab-tests", description: "Manage laboratory tests, pricing, samples and turnaround time.", fields: [
    { name: "title", label: "Test name", required: true }, { name: "code", label: "Test code", required: true },
    { name: "category", label: "Category", required: true }, { name: "sampleType", label: "Sample type", required: true },
    { name: "method", label: "Method" }, { name: "turnaroundHours", label: "Turnaround (hours)", type: "number" },
    { name: "price", label: "Price", type: "number", required: true }, { name: "description", label: "Description", type: "textarea" },
    { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "code", "category", "sampleType", "turnaroundHours", "price", "status"] },
  { label: "Lab Categories", singular: "Lab Category", module: "lab-categories", description: "Group tests into clear diagnostic categories.", fields: [
    { name: "title", label: "Category name", required: true }, { name: "code", label: "Category code", required: true },
    { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "code", "description", "status"] },
  { label: "Units", singular: "Unit", module: "lab-units", description: "Maintain measurement units used in lab reports.", fields: [
    { name: "title", label: "Unit name", required: true }, { name: "symbol", label: "Symbol", required: true },
    { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "symbol", "description", "status"] },
  { label: "Lab Parameters", singular: "Lab Parameter", module: "lab-parameters", description: "Configure report parameters and their normal reference ranges.", fields: [
    { name: "title", label: "Parameter name", required: true }, { name: "testName", label: "Lab test", required: true },
    { name: "referenceFrom", label: "Reference from" }, { name: "referenceTo", label: "Reference to" },
    { name: "unit", label: "Unit", required: true }, { name: "gender", label: "Applies to", type: "select", options: ["ALL", "MALE", "FEMALE", "CHILDREN"] },
    { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "testName", "referenceFrom", "referenceTo", "unit", "description", "status"] },
];

const defaultLabTests = [
  ["Complete Blood Count (CBC)", "CBC", "Hematology", "EDTA Blood", "Automated cell counter", 6, 350], ["Hemoglobin (Hb)", "HB", "Hematology", "EDTA Blood", "Cyanmethemoglobin", 4, 150],
  ["Erythrocyte Sedimentation Rate", "ESR", "Hematology", "Whole Blood", "Westergren", 4, 180], ["Blood Group & Rh Type", "BGRH", "Hematology", "EDTA Blood", "Agglutination", 4, 250],
  ["Fasting Blood Sugar", "FBS", "Biochemistry", "Fluoride Plasma", "Hexokinase", 4, 120], ["Postprandial Blood Sugar", "PPBS", "Biochemistry", "Fluoride Plasma", "Hexokinase", 4, 120],
  ["HbA1c", "HBA1C", "Diabetes", "EDTA Blood", "HPLC", 8, 500], ["Lipid Profile", "LIPID", "Biochemistry", "Serum", "Enzymatic", 8, 650],
  ["Liver Function Test", "LFT", "Biochemistry", "Serum", "Photometry", 8, 700], ["Kidney Function Test", "KFT", "Biochemistry", "Serum", "Photometry", 8, 650],
  ["Thyroid Profile (T3, T4, TSH)", "THYROID", "Hormones", "Serum", "CLIA", 12, 750], ["Urine Routine & Microscopy", "URINE-RM", "Clinical Pathology", "Urine", "Microscopy", 4, 200],
  ["Stool Routine & Microscopy", "STOOL-RM", "Clinical Pathology", "Stool", "Microscopy", 6, 250], ["C-Reactive Protein", "CRP", "Immunology", "Serum", "Immunoturbidimetry", 6, 450],
  ["Dengue NS1 Antigen", "DENGUE-NS1", "Serology", "Serum", "ELISA", 8, 800], ["Malaria Parasite Test", "MP", "Parasitology", "EDTA Blood", "Peripheral smear", 4, 300],
  ["Widal Test", "WIDAL", "Serology", "Serum", "Slide agglutination", 6, 300], ["Vitamin D (25-OH)", "VIT-D", "Vitamins", "Serum", "CLIA", 24, 1200],
  ["Vitamin B12", "VIT-B12", "Vitamins", "Serum", "CLIA", 24, 900], ["Serum Electrolytes", "ELECTROLYTES", "Biochemistry", "Serum", "Ion-selective electrode", 6, 550],
] as const;

const value = (row: Row, key: string) => key in row ? row[key] : row.data?.[key];
const pretty = (text: string) => text.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

export function LabMasterDataPage() {
  const qc = useQueryClient();
  const seeded = useRef(false);
  const [active, setActive] = useState(0), [search, setSearch] = useState(""), [editing, setEditing] = useState<Row | null>(null), [modalOpen, setModalOpen] = useState(false);
  const section = sections[active], endpoint = `/crm/modules/${section.module}`;
  const { data, isLoading, error } = useQuery({ queryKey: [endpoint], queryFn: () => api.get(endpoint).then(unwrap) });
  const rows: Row[] = data?.items || [];
  useEffect(() => {
    if (section.module !== "lab-tests" || !data || rows.length || seeded.current) return;
    seeded.current = true;
    Promise.all(defaultLabTests.map(([title, code, category, sampleType, method, turnaroundHours, price]) => api.post(endpoint, { title, code, category, sampleType, method, turnaroundHours, price, description: `${title} laboratory test`, status: "ACTIVE" })))
      .then(() => qc.invalidateQueries({ queryKey: [endpoint] }))
      .catch(() => { seeded.current = false; });
  }, [data, endpoint, qc, rows.length, section.module]);
  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const save = useMutation({
    mutationFn: (payload: Record<string, FormDataEntryValue>) => editing ? api.patch(`${endpoint}/${editing.id}`, payload) : api.post(endpoint, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [endpoint] }); setModalOpen(false); setEditing(null); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`${endpoint}/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: [endpoint] }) });
  const openForm = (row: Row | null = null) => { setEditing(row); setModalOpen(true); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate(Object.fromEntries(new FormData(event.currentTarget))); };
  const switchSection = (index: number) => { setActive(index); setSearch(""); setEditing(null); setModalOpen(false); };

  return <div className="lab-layout">
    <aside className="lab-menu panel">{sections.map((item, index) => <button key={item.module} className={active === index ? "active" : ""} onClick={() => switchSection(index)}>{item.label}</button>)}</aside>
    <section className="lab-content panel">
      <header className="lab-head"><div><span>LABORATORY</span><h1>{section.label}</h1><p>{section.description}</p></div><button className="btn" onClick={() => openForm()}><Plus/> Add {section.singular}</button></header>
      <div className="lab-toolbar"><div className="search"><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${section.label.toLowerCase()}...`}/></div><small>{filtered.length} record{filtered.length === 1 ? "" : "s"}</small></div>
      {isLoading ? <div className="state">Loading {section.label.toLowerCase()}…</div> : error ? <div className="state error">Unable to load lab data.</div> : <div className="table-wrap"><table><thead><tr>{section.columns.map((column) => <th key={column}>{pretty(column)}</th>)}<th>Actions</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}>{section.columns.map((column) => <td key={column}>{column === "status" ? <span className="status-pill">{String(value(row, column) || "ACTIVE")}</span> : String(value(row, column) ?? "—")}</td>)}<td><div className="row-actions"><button aria-label="Edit" onClick={() => openForm(row)}><Pencil/></button><button className="danger" aria-label="Delete" onClick={() => confirm(`Delete this ${section.singular.toLowerCase()}?`) && remove.mutate(row.id)}><Trash2/></button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><FlaskConical/><p>No {section.label.toLowerCase()} found.</p><button className="btn" onClick={() => openForm()}>Add the first one</button></div>}</div>}
    </section>
    {modalOpen && <div className="modal-bg"><form className="modal lab-modal" onSubmit={submit}><div className="modal-head"><div><h2>{editing ? "Edit" : "Add"} {section.singular}</h2><p>Enter the details below.</p></div><button type="button" className="icon" onClick={() => setModalOpen(false)}><X/></button></div>{save.error && <div className="alert error">Unable to save. Check the entered values and try again.</div>}<div className="modal-grid">{section.fields.map((field) => <label key={field.name} className={field.type === "textarea" ? "wide" : ""}>{field.label}{field.type === "textarea" ? <textarea name={field.name} defaultValue={String(value(editing || {} as Row, field.name) || "")}/> : field.type === "select" ? <select name={field.name} required={field.required} defaultValue={String(value(editing || {} as Row, field.name) || field.options?.[0] || "")} >{field.options?.map((option) => <option key={option} value={option}>{pretty(option.toLowerCase())}</option>)}</select> : <input name={field.name} type={field.type || "text"} required={field.required} min={field.type === "number" ? 0 : undefined} step={field.name === "price" ? "0.01" : undefined} defaultValue={String(value(editing || {} as Row, field.name) || "")}/>}</label>)}</div><div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setModalOpen(false)}>Cancel</button><button className="btn" disabled={save.isPending}>{save.isPending ? "Saving…" : `Save ${section.singular}`}</button></div></form></div>}
  </div>;
}
