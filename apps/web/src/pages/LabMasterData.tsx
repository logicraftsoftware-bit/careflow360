import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Pencil, Plus, Search, Trash2, ArrowLeft } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import "./LabMasterData.css";
import { SpecimenTubeSelect } from "../components/SpecimenTubeSelect";
import { api, unwrap } from "../api";
import { useCatalogPagination } from "../components/CatalogPagination";

type Field = { name: string; label: string; type?: "text" | "number" | "textarea" | "select"; required?: boolean; options?: string[] };
type Section = { label: string; singular: string; module: string; description: string; fields: Field[]; columns: string[] };
type Row = { id: string; title: string; status: string; data?: Record<string, unknown> } & Record<string, unknown>;

const sections: Section[] = [
  { label: "Pathology Test", singular: "Pathology Test", module: "lab-tests", description: "Manage pathology tests, pricing, samples and turnaround time.", fields: [
    { name: "title", label: "Test name", required: true }, { name: "code", label: "Test code", required: true },
    { name: "category", label: "Pathology category", type: "select", required: true }, { name: "sampleType", label: "Sample type", required: true },
    { name: "specimenTubeId", label: "Specimen tube", type: "select" },
    { name: "method", label: "Method" }, { name: "turnaroundHours", label: "Turnaround (hours)", type: "number" },
    { name: "price", label: "Price", type: "number", required: true }, { name: "description", label: "Description", type: "textarea" },
    { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "code", "category", "sampleType", "specimenTubeId", "turnaroundHours", "price", "status"] },
  { label: "Pathology Category", singular: "Pathology Category", module: "lab-categories", description: "Group pathology tests into clear diagnostic categories.", fields: [
    { name: "title", label: "Category name", required: true }, { name: "code", label: "Category code", required: true },
    { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "code", "description", "status"] },
  { label: "Unit", singular: "Unit", module: "lab-units", description: "Maintain measurement units used in pathology reports.", fields: [
    { name: "title", label: "Unit name", required: true }, { name: "symbol", label: "Symbol", required: true },
    { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "symbol", "description", "status"] },
  { label: "Pathology Parameter", singular: "Pathology Parameter", module: "lab-parameters", description: "Configure pathology parameters and their normal reference ranges.", fields: [
    { name: "title", label: "Parameter name", required: true }, { name: "testName", label: "Pathology test", type: "select", required: true },
    { name: "referenceFrom", label: "Reference from" }, { name: "referenceTo", label: "Reference to" },
    { name: "unit", label: "Unit", type: "select", required: true }, { name: "gender", label: "Applies to", type: "select", options: ["ALL", "MALE", "FEMALE", "CHILDREN"] },
    { name: "description", label: "Description", type: "textarea" }, { name: "status", label: "Status", type: "select", options: ["ACTIVE", "INACTIVE"], required: true },
  ], columns: ["title", "testName", "referenceFrom", "referenceTo", "unit", "description", "status"] },
];

const defaultCategories = ["Hematology", "Biochemistry", "Diabetes", "Hormones", "Clinical Pathology", "Immunology", "Serology", "Parasitology", "Vitamins"];
const defaultUnits = [["Percentage", "%"], ["Grams per decilitre", "g/dL"], ["Milligrams per decilitre", "mg/dL"], ["Nanograms per decilitre", "ng/dL"], ["Micrograms per decilitre", "µg/dL"], ["Milligrams per litre", "mg/L"], ["Nanograms per millilitre", "ng/mL"], ["Units per litre", "U/L"], ["International units per litre", "IU/L"], ["Millimoles per litre", "mmol/L"], ["Micro-international units per millilitre", "µIU/mL"], ["Cells per cubic millimetre", "cells/mm³"], ["Millimetres per hour", "mm/hr"], ["Picograms per millilitre", "pg/mL"], ["pH scale", "pH"]];
const value = (row: Row, key: string) => key in row ? row[key] : row.data?.[key];
const pretty = (text: string) => text.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

export function LabMasterDataPage({ form = false }: { form?: boolean }) {
  const navigate = useNavigate();
  const { section: sectionSlug, id } = useParams();
  const [searchParams] = useSearchParams();
  const selectedSection = sectionSlug || searchParams.get("section") || "lab-tests";
  const active = Math.max(0, sections.findIndex((item) => item.module === selectedSection));
  const qc = useQueryClient();
  const seeded = useRef(new Set<string>());
  const [search, setSearch] = useState("");
  const section = sections[active], endpoint = `/crm/modules/${section.module}`;
  const { data, isLoading, error } = useQuery({ queryKey: [endpoint], queryFn: () => api.get(endpoint).then(unwrap) });
  const rows: Row[] = data?.items || [];
  const editing = id ? rows.find((row) => row.id === id) || null : null;
  const listPath = section.module === "lab-tests" ? "/app/lab" : `/app/lab?section=${section.module}`;
  const closeForm = () => navigate(listPath);
  const { data: categoryData } = useQuery({ queryKey: ["/crm/modules/lab-categories"], queryFn: () => api.get("/crm/modules/lab-categories").then(unwrap) });
  const { data: unitData } = useQuery({ queryKey: ["/crm/modules/lab-units"], queryFn: () => api.get("/crm/modules/lab-units").then(unwrap) });
  const { data: testData } = useQuery({ queryKey: ["/crm/modules/lab-tests"], queryFn: () => api.get("/crm/modules/lab-tests").then(unwrap) });
  const { data: tubeData, isLoading: tubesLoading, error: tubesError } = useQuery({ queryKey: ["/crm/modules/specimen-tubes"], queryFn: () => api.get("/crm/modules/specimen-tubes").then(unwrap) });
  const tubes: Row[] = tubeData?.items || [];
  const tubeName = (row: Row) => { const id = String(value(row, "specimenTubeId") || ""); return tubes.find((tube) => tube.id === id)?.title || (id ? "Unavailable specimen tube" : "\u2014"); };
  const categories: Row[] = categoryData?.items || [], units: Row[] = unitData?.items || [], tests: Row[] = testData?.items || [];
  useEffect(() => {
    if (!categoryData || seeded.current.has("lab-categories")) return;
    const existing = new Set(categories.map((row) => row.title));
    const missing = defaultCategories.filter((title) => !existing.has(title));
    if (!missing.length) return;
    seeded.current.add("lab-categories");
    Promise.all(missing.map((title) => api.post("/crm/modules/lab-categories", { title, code: title.toUpperCase().replace(/[^A-Z]+/g, "_"), status: "ACTIVE" }))).then(() => qc.invalidateQueries({ queryKey: ["/crm/modules/lab-categories"] })).catch(() => seeded.current.delete("lab-categories"));
  }, [categories.length, categoryData, qc]);
  useEffect(() => {
    if (!unitData || seeded.current.has("lab-units")) return;
    const existing = new Set(units.map((row) => String(value(row, "symbol"))));
    const missing = defaultUnits.filter(([, symbol]) => !existing.has(symbol));
    if (!missing.length) return;
    seeded.current.add("lab-units");
    Promise.all(missing.map(([title, symbol]) => api.post("/crm/modules/lab-units", { title, symbol, status: "ACTIVE" }))).then(() => qc.invalidateQueries({ queryKey: ["/crm/modules/lab-units"] })).catch(() => seeded.current.delete("lab-units"));
  }, [qc, unitData, units.length]);
  const filtered = useMemo(() => rows.filter((row) => (JSON.stringify(row) + tubeName(row)).toLowerCase().includes(search.toLowerCase())), [rows, search, tubes]);
  const { visibleRows, pagination } = useCatalogPagination(filtered, `${active}:${search}`, active === 0);
  const save = useMutation({
    mutationFn: (payload: Record<string, FormDataEntryValue>) => editing ? api.patch(`${endpoint}/${editing.id}`, payload) : api.post(endpoint, payload, { headers: { "X-Test-Catalog-Version": "2" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [endpoint] }); closeForm(); },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`${endpoint}/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: [endpoint] }) });
  const openForm = (row: Row | null = null) => { save.reset(); navigate(`/app/lab/${section.module}/${row ? `${row.id}/edit` : "new"}`); };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); save.mutate(Object.fromEntries(new FormData(event.currentTarget))); };
  const switchSection = (index: number) => { setSearch(""); navigate(index === 0 ? "/app/lab" : `/app/lab?section=${sections[index].module}`); };
  const optionsFor = (field: Field) => field.options || (field.name === "category" ? categories.map((row) => row.title) : field.name === "unit" ? units.map((row) => String(value(row, "symbol") || row.title)) : field.name === "testName" ? tests.map((row) => row.title) : []);

  if (form) return <div className="lab-entry-page">
    <button type="button" className="btn ghost" onClick={closeForm}><ArrowLeft/> Back to {section.label}</button>
    {!sections.some((item) => item.module === selectedSection) ? <div className="panel state error">Unknown lab section.</div>
      : isLoading ? <div className="panel state">Loading lab details...</div>
      : error ? <div className="panel state error">Unable to load lab details. Please reload and try again.</div>
      : id && !editing ? <div className="panel state error">This record was not found.</div>
      : <form key={`${section.module}:${id || "new"}`} className="panel lab-entry-form" onSubmit={submit}>
      <header className="lab-head"><div><span>LABORATORY</span><h1>{id ? "Edit" : "Add"} {section.singular}</h1><p>{section.description}</p></div></header>
      <div className="lab-entry-body">{save.error && <div className="alert error">Unable to save. Check the entered values and try again.</div>}<div className="lab-entry-grid">{section.fields.map((field) => { const fieldOptions = optionsFor(field), current = String(value(editing || {} as Row, field.name) ?? fieldOptions[0] ?? ""); if (field.name === "specimenTubeId") {
        const selectedId = String(value(editing || {} as Row, field.name) || "");
        return <SpecimenTubeSelect key={field.name} defaultValue={selectedId} loading={tubesLoading} error={!!tubesError} options={tubes.map((tube) => ({
          id: tube.id, active: tube.status === "ACTIVE",
          label: `${tube.title}${value(tube, "capColor") ? ` - ${value(tube, "capColor")}` : ""}${tube.status !== "ACTIVE" ? " (inactive)" : ""}`,
          search: [tube.title, value(tube, "code"), value(tube, "sampleType"), value(tube, "capColor")].filter(Boolean).join(" "),
        }))}/>;
      } return <label key={field.name} className={field.type === "textarea" ? "wide" : ""}>{field.label}{field.type === "textarea" ? <textarea name={field.name} defaultValue={current}/> : field.type === "select" ? <select name={field.name} required={field.required} defaultValue={current}>{current && !fieldOptions.includes(current) && <option value={current}>{current}</option>}{!fieldOptions.length && !current && <option value="">Add a master record first</option>}{fieldOptions.map((option) => <option key={option} value={option}>{field.options ? pretty(option.toLowerCase()) : option}</option>)}</select> : <input name={field.name} type={field.type || "text"} required={field.required} min={field.type === "number" ? 0 : undefined} step={field.name === "price" ? "0.01" : undefined} defaultValue={current}/>}</label>; })}</div><div className="lab-entry-actions"><button type="button" className="btn ghost" onClick={closeForm}>Cancel</button><button className="btn" disabled={save.isPending}>{save.isPending ? "Saving…" : `Save ${section.singular}`}</button></div></div></form>}
  </div>;

  return <div className="lab-layout">
    <aside className="lab-menu panel">{sections.map((item, index) => <button key={item.module} className={active === index ? "active" : ""} onClick={() => switchSection(index)}>{item.label}</button>)}</aside>
    <section className="lab-content panel">
      <header className="lab-head"><div><span>LABORATORY</span><h1>{section.label}</h1><p>{section.description}</p></div><button className="btn" onClick={() => openForm()}><Plus/> Add {section.singular}</button></header>
      <div className="lab-toolbar"><div className="search"><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${section.label.toLowerCase()}...`}/></div><small>{filtered.length} record{filtered.length === 1 ? "" : "s"}</small></div>
      {isLoading ? <div className="state">Loading {section.label.toLowerCase()}…</div> : error ? <div className="state error">Unable to load lab data.</div> : <div className="table-wrap"><table><thead><tr>{section.columns.map((column) => <th key={column}>{column === "specimenTubeId" ? "Specimen tube" : pretty(column)}</th>)}<th>Actions</th></tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id}>{section.columns.map((column) => <td key={column}>{column === "status" ? <span className="status-pill">{String(value(row, column) || "ACTIVE")}</span> : column === "specimenTubeId" ? tubeName(row) : String(value(row, column) ?? "—")}</td>)}<td><div className="row-actions"><button aria-label="Edit" onClick={() => openForm(row)}><Pencil/></button><button className="danger" aria-label="Delete" onClick={() => confirm(`Delete this ${section.singular.toLowerCase()}?`) && remove.mutate(row.id)}><Trash2/></button></div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><FlaskConical/><p>No {section.label.toLowerCase()} found.</p><button className="btn" onClick={() => openForm()}>Add the first one</button></div>}{pagination}</div>}
    </section>

  </div>;
}
