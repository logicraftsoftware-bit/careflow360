import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";
import { DoctorScheduleEditor } from "./DoctorScheduleEditor";
import { AppointmentFields } from "./AppointmentFields";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, Filter, Plus, Search, SquarePen, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
type Mode = "tenant" | "admin";
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
  endpoint?: string;
};
type Config = {
  title: string;
  description: string;
  fields: Field[];
  columns: string[];
  readOnly?: boolean;
  noCreate?: boolean;
  fixedStatus?: string;
};
const f = (name: string, label: string, type = "text", required = false, options?: string[], endpoint?: string): Field => ({ name, label, type, required, options, endpoint });
const active = ["ACTIVE", "INACTIVE"];
const stat = f("status", "Status", "select", true, active);
const configs: Record<string, Config> = {
  registrations: {
    title: "Registrations",
    description: "Review clinic applications and approve or suspend access.",
    fields: [],
    columns: ["name", "ownerName", "email", "mobile", "status", "createdAt"],
    readOnly: true,
    noCreate: true,
  },
  tenants: {
    title: "Tenants / Clinics",
    description: "Manage every clinic account and platform access.",
    fields: [],
    columns: ["name", "ownerName", "email", "mobile", "status", "createdAt"],
    readOnly: true,
    noCreate: true,
  },
  plans: {
    title: "Subscription Plans",
    description: "Create and maintain database-driven SaaS pricing.",
    fields: [f("name", "Plan name", "text", true), f("code", "Code", "text", true), f("description", "Description", "textarea"), f("monthlyPrice", "Monthly price", "number", true), f("annualPrice", "Annual price", "number", true), f("trialDays", "Trial days", "number", true), f("currency", "Currency", "select", true, ["INR", "USD", "EUR"]), f("popular", "Popular", "checkbox"), stat],
    columns: ["name", "code", "monthlyPrice", "annualPrice", "trialDays", "status"],
  },
  "features-limits": {
    title: "Features & Limits",
    description: "Define plan entitlements and usage limits.",
    fields: [f("title", "Feature name", "text", true), f("code", "Code", "text", true), f("value", "Limit", "number"), f("description", "Description", "textarea"), stat],
    columns: ["title", "code", "value", "status", "updatedAt"],
  },
  subscriptions: {
    title: "Subscriptions",
    description: "Track clinic subscriptions and renewals.",
    fields: [f("title", "Reference", "text", true), f("tenant", "Tenant", "text", true), f("plan", "Plan", "text", true), f("billingCycle", "Billing cycle", "select", true, ["MONTHLY", "ANNUAL"]), f("renewalDate", "Renewal date", "date"), f("status", "Status", "select", true, ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"])],
    columns: ["title", "tenant", "plan", "billingCycle", "renewalDate", "status"],
  },
  invoices: {
    title: "SaaS Invoices",
    description: "Manage platform invoices issued to clinics.",
    fields: [f("title", "Invoice number", "text", true), f("tenant", "Tenant", "text", true), f("amount", "Amount", "number", true), f("dueDate", "Due date", "date"), f("status", "Status", "select", true, ["DRAFT", "ISSUED", "PAID", "OVERDUE", "VOID"])],
    columns: ["title", "tenant", "amount", "dueDate", "status"],
  },
  transactions: {
    title: "Transactions",
    description: "Reconcile platform subscription transactions.",
    fields: [f("title", "Transaction ID", "text", true), f("tenant", "Tenant", "text", true), f("provider", "Provider", "text", true), f("amount", "Amount", "number", true), f("status", "Status", "select", true, ["PENDING", "PAID", "FAILED", "REFUNDED"])],
    columns: ["title", "tenant", "provider", "amount", "status"],
  },
  "platform-staff": {
    title: "Platform Staff",
    description: "Manage SaaS operations and support employees.",
    fields: [f("title", "Full name", "text", true), f("email", "Email", "email", true), f("mobile", "Mobile"), f("role", "Role", "select", true, ["Platform Staff", "Platform Support", "Platform Finance"]), stat],
    columns: ["title", "email", "mobile", "role", "status"],
  },
  "roles-permissions": {
    title: "Roles & Permissions",
    description: "Configure roles and permission keys.",
    fields: [f("title", "Role name", "text", true), f("code", "Role code", "text", true), f("permissions", "Permission keys", "textarea", true), stat],
    columns: ["title", "code", "permissions", "status"],
  },
  usage: {
    title: "Usage",
    description: "Track billing and capacity usage metrics.",
    fields: [f("title", "Metric", "text", true), f("tenant", "Tenant"), f("value", "Value", "number", true), f("period", "Period", "text", true), stat],
    columns: ["title", "tenant", "value", "period", "status"],
  },
  announcements: {
    title: "Announcements",
    description: "Publish platform notices to clinics.",
    fields: [f("title", "Title", "text", true), f("body", "Message", "textarea", true), f("audience", "Audience", "select", true, ["ALL_TENANTS", "SELECTED_PLANS", "SELECTED_TENANTS"]), f("publishDate", "Publish date", "date"), f("status", "Status", "select", true, ["DRAFT", "ACTIVE", "ARCHIVED"])],
    columns: ["title", "audience", "publishDate", "status", "updatedAt"],
  },
  integrations: {
    title: "Integrations",
    description: "Manage secure platform provider configurations.",
    fields: [f("title", "Integration", "text", true), f("provider", "Provider", "text", true), f("environment", "Environment", "select", true, ["TEST", "PRODUCTION"]), f("description", "Notes", "textarea"), stat],
    columns: ["title", "provider", "environment", "status", "updatedAt"],
  },
  settings: {
    title: "Settings",
    description: "Manage operational defaults and configuration.",
    fields: [f("title", "Setting", "text", true), f("category", "Category", "select", true, ["GENERAL", "BRANDING", "APPOINTMENTS", "NOTIFICATIONS", "SECURITY", "INTEGRATIONS"]), f("value", "Value", "textarea", true), stat],
    columns: ["title", "category", "value", "status", "updatedAt"],
  },
  "audit-logs": {
    title: "Audit Logs",
    description: "Review security-relevant activity.",
    fields: [],
    columns: ["action", "entityType", "entityId", "ipAddress", "createdAt"],
    readOnly: true,
    noCreate: true,
  },
  leads: {
    title: "Enquiries / Leads",
    description: "Capture and progress every patient enquiry.",
    fields: [f("name", "Lead name", "text", true), f("mobile", "Mobile", "text", true), f("email", "Email", "email"), f("city", "City"), f("departmentId", "Department", "reference", false, undefined, "/crm/departments"), f("doctorId", "Doctor", "reference", false, undefined, "/crm/doctors"), f("priority", "Priority", "select", true, ["LOW", "MEDIUM", "HIGH", "URGENT"]), f("status", "Status", "select", true, ["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP_REQUIRED", "APPOINTMENT_PENDING", "CONVERTED", "NOT_INTERESTED", "CALLBACK_LATER", "INVALID", "LOST"]), f("remarks", "Remarks", "textarea")],
    columns: ["leadNumber", "name", "mobile", "city", "priority", "status"],
  },
  "interested-leads": {
    title: "Interested Leads",
    description: "Work enquiries showing active interest.",
    fields: [],
    columns: ["leadNumber", "name", "mobile", "priority", "status", "updatedAt"],
    readOnly: true,
    noCreate: true,
    fixedStatus: "INTERESTED",
  },
  "converted-leads": {
    title: "Converted Leads",
    description: "Review converted patient enquiries.",
    fields: [],
    columns: ["leadNumber", "name", "mobile", "priority", "status", "updatedAt"],
    readOnly: true,
    noCreate: true,
    fixedStatus: "CONVERTED",
  },
  followups: {
    title: "Follow-ups",
    description: "Schedule calls and patient communications.",
    fields: [f("leadId", "Lead", "reference", true, undefined, "/crm/leads"), f("scheduledAt", "Follow-up time", "datetime-local", true), f("type", "Type", "select", true, ["CALL", "WHATSAPP", "SMS", "EMAIL", "MEETING"]), f("remarks", "Remarks", "textarea"), f("outcome", "Outcome", "textarea"), f("status", "Status", "select", true, ["PENDING", "COMPLETED", "MISSED", "CANCELLED"])],
    columns: ["leadId", "scheduledAt", "type", "outcome", "status", "createdAt"],
  },
  patients: {
    title: "Patients",
    description: "Maintain isolated patient master records.",
    fields: [f("name", "Patient name", "text", true), f("mobile", "Mobile", "text", true), f("email", "Email", "email"), f("gender", "Gender", "select", false, ["MALE", "FEMALE", "OTHER"]), f("dob", "Date of birth", "date"), f("address", "Address", "textarea"), f("city", "City"), f("state", "State"), f("pin", "PIN"), stat],
    columns: ["patientNumber", "name", "mobile", "email", "city", "status"],
  },
  appointments: {
    title: "Appointments",
    description: "Book and manage doctor appointments.",
    fields: [f("patientId", "Patient", "reference", true, undefined, "/crm/patients"), f("branchId", "Branch", "reference", true, undefined, "/crm/branches"), f("departmentId", "Department", "reference", true, undefined, "/crm/departments"), f("doctorId", "Doctor", "reference", true, undefined, "/crm/doctors"), f("startsAt", "Start time", "datetime-local", true), f("amount", "Fee", "number", true), f("status", "Status", "select", true, ["DRAFT", "BOOKING_PENDING", "PAYMENT_PENDING", "CONFIRMED", "CHECKED_IN", "IN_CONSULTATION", "COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED"]), f("paymentStatus", "Payment status", "select", true, ["NOT_REQUIRED", "PENDING", "PAID", "FAILED", "PARTIALLY_PAID", "REFUNDED"])],
    columns: ["appointmentNumber", "patientId", "doctorId", "startsAt", "status", "paymentStatus"],
  },
  calendar: {
    title: "Appointment Calendar",
    description: "View appointments in chronological order.",
    fields: [],
    columns: ["appointmentNumber", "patientId", "doctorId", "startsAt", "status", "paymentStatus"],
    readOnly: true,
    noCreate: true,
  },
  doctors: {
    title: "Doctors",
    description: "Manage doctors and consultation fees.",
    fields: [f("name", "Doctor name", "text", true), f("departmentId", "Department", "reference", false, undefined, "/crm/departments"), f("qualification", "Qualification"), f("specialization", "Specialization"), f("registrationNumber", "Registration number"), f("mobile", "Mobile"), f("email", "Email", "email"), f("experience", "Experience", "number"), f("consultationFee", "Consultation fee", "number"), stat],
    columns: ["name", "specialization", "qualification", "mobile", "consultationFee", "status"],
  },
  "doctor-schedules": {
    title: "Doctor Schedules",
    description: "Configure date-wise doctor availability and patient slots.",
    fields: [f("doctorId", "Doctor", "reference", true, undefined, "/crm/doctors"), f("branchId", "Branch", "reference", true, undefined, "/crm/branches"), f("scheduleDate", "Schedule date", "date", true), f("startTime", "Start time", "text", true), f("endTime", "End time", "text", true), f("slotMinutes", "Slot minutes", "number", true), f("maxPatients", "Maximum patients", "number", true), stat],
    columns: ["doctorId", "branchId", "scheduleCount", "nextSchedule"],
  },
  departments: {
    title: "Departments",
    description: "Organize clinical specialties.",
    fields: [f("name", "Department name", "text", true), f("code", "Code", "text", true), f("description", "Description", "textarea"), stat],
    columns: ["name", "code", "description", "status", "updatedAt"],
  },
  branches: {
    title: "Branches",
    description: "Manage clinic locations.",
    fields: [f("name", "Branch name", "text", true), f("address", "Address", "textarea"), f("city", "City"), f("state", "State"), f("country", "Country"), f("pin", "PIN"), f("phone", "Phone"), f("email", "Email", "email"), stat],
    columns: ["name", "city", "phone", "email", "status", "updatedAt"],
  },
  staff: {
    title: "Staff",
    description: "Manage clinic employees and roles.",
    fields: [f("title", "Full name", "text", true), f("email", "Email", "email", true), f("mobile", "Mobile"), f("role", "Role", "select", true, ["CLINIC_ADMIN", "BRANCH_ADMIN", "MANAGER", "CALL_CENTRE", "RECEPTIONIST", "DOCTOR", "BILLING"]), stat],
    columns: ["title", "email", "mobile", "role", "status"],
  },
  reports: {
    title: "Reports",
    description: "Create saved operational reports.",
    fields: [f("title", "Report name", "text", true), f("type", "Type", "select", true, ["LEADS", "APPOINTMENTS", "PATIENTS", "PAYMENTS", "STAFF"]), f("dateRange", "Date range"), f("format", "Format", "select", true, ["TABLE", "CSV", "PDF"]), stat],
    columns: ["title", "type", "dateRange", "format", "status"],
  },
  payments: {
    title: "Payments",
    description: "Track payment and reconciliation records.",
    fields: [f("title", "Reference", "text", true), f("appointment", "Appointment"), f("provider", "Provider", "text", true), f("amount", "Amount", "number", true), f("currency", "Currency", "select", true, ["INR", "USD"]), f("status", "Status", "select", true, ["PENDING", "PAID", "FAILED", "PARTIALLY_PAID", "REFUNDED"])],
    columns: ["title", "appointment", "provider", "amount", "status"],
  },
  whatsapp: {
    title: "WhatsApp",
    description: "Manage templates and communication logs.",
    fields: [f("title", "Template name", "text", true), f("templateCode", "Template code"), f("language", "Language", "select", true, ["en", "hi", "bn"]), f("message", "Message", "textarea", true), f("status", "Status", "select", true, ["DRAFT", "ACTIVE", "PAUSED"])],
    columns: ["title", "templateCode", "language", "status", "updatedAt"],
  },
  "meta-ads": {
    title: "Meta Ads",
    description: "Manage lead-form campaign mappings.",
    fields: [f("title", "Connection name", "text", true), f("pageId", "Page ID"), f("formId", "Form ID"), f("campaign", "Campaign"), f("status", "Status", "select", true, ["CONNECTED", "DISCONNECTED", "PAUSED"])],
    columns: ["title", "pageId", "formId", "campaign", "status"],
  },
  notifications: {
    title: "Notifications",
    description: "Manage notification-center messages.",
    fields: [f("type", "Type", "select", true, ["GENERAL", "LEAD", "FOLLOW_UP", "APPOINTMENT", "PAYMENT"]), f("title", "Title", "text", true), f("body", "Message", "textarea", true)],
    columns: ["type", "title", "body", "readAt", "createdAt"],
  },
  support: {
    title: "Support Tickets",
    description: "Manage platform support requests.",
    fields: [f("subject", "Subject", "text", true), f("description", "Description", "textarea", true), f("priority", "Priority", "select", true, ["LOW", "MEDIUM", "HIGH", "URGENT"]), f("status", "Status", "select", true, ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"])],
    columns: ["subject", "priority", "status", "assignedToId", "updatedAt"],
  },
};
const actual: Record<string, string> = {
  branches: "branches",
  departments: "departments",
  doctors: "doctors",
  "doctor-schedules": "doctorSchedules",
  leads: "leads",
  "interested-leads": "leads",
  "converted-leads": "leads",
  followups: "followups",
  patients: "patients",
  appointments: "appointments",
  calendar: "appointments",
  notifications: "notifications",
  support: "supportTickets",
  "audit-logs": "auditLogs",
};
const label = (s: string) =>
  s
    .replace(/([A-Z])/g, " $1")
    .replaceAll("_", " ")
    .replace(/^./, (x) => x.toUpperCase())
    .replace(/ Id$/, "");
const val = (r: any, k: string) => r[k] ?? r.data?.[k];
const show = (v: any) => (v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "object" ? v.name || v.title || JSON.stringify(v) : /T\d\d:\d\d/.test(String(v)) ? new Date(v).toLocaleString() : String(v));
function Ref({ field, value }: { field: Field; value?: string }) {
  const { data } = useQuery({
    queryKey: ["ref", field.endpoint],
    queryFn: () => api.get(`${field.endpoint}?limit=100`).then(unwrap),
  });
  const rows = Array.isArray(data) ? data : data?.items || [];
  return (
    <select name={field.name} defaultValue={value || ""} required={field.required}>
      <option value="">Select {field.label}</option>
      {rows.map((r: any) => (
        <option key={r.id} value={r.id}>
          {r.name || r.title || r.patientNumber || r.leadNumber || r.id}
        </option>
      ))}
    </select>
  );
}
function PatientSearchRef({ field, value }: { field: Field; value?: string }) {
  const { data } = useQuery({ queryKey: ["ref", field.endpoint], queryFn: () => api.get(`${field.endpoint}?limit=100`).then(unwrap) });
  const rows = Array.isArray(data) ? data : data?.items || [];
  const [selectedId, setSelectedId] = useState(value || "");
  const [searchText, setSearchText] = useState("");
  const [openResults, setOpenResults] = useState(false);
  const patientText = (patient: any) => `${patient.name} · ${patient.mobile || "No phone"} · ${patient.patientNumber || patient.id}`;
  useEffect(() => { const selected = rows.find((patient: any) => patient.id === selectedId); if (selected && !searchText) setSearchText(patientText(selected)); }, [rows, selectedId]);
  const query = searchText.toLowerCase().trim();
  const matches = rows.filter((patient: any) => !query || [patient.name, patient.mobile, patient.patientNumber, patient.id].some((item) => String(item || "").toLowerCase().includes(query))).slice(0, 10);
  return <div className="patient-search">
    <input type="hidden" name={field.name} value={selectedId} />
    <input required={field.required} value={searchText} placeholder="Search name, phone or patient ID" autoComplete="off" onFocus={() => setOpenResults(true)} onBlur={() => setTimeout(() => setOpenResults(false), 150)} onChange={(event) => { setSearchText(event.target.value); setSelectedId(""); setOpenResults(true); }} />
    {openResults && <div className="patient-results">{matches.length ? matches.map((patient: any) => <button type="button" key={patient.id} onMouseDown={() => { setSelectedId(patient.id); setSearchText(patientText(patient)); setOpenResults(false); }}><strong>{patient.name}</strong><span>{patient.mobile || "No phone"}</span><small>{patient.patientNumber || patient.id}</small></button>) : <p>No matching patient found</p>}</div>}
    {selectedId && <small className="patient-selected">Patient selected</small>}
  </div>;
}
export function ResourcePage({ slug, mode }: { slug: string; mode: Mode }) {
  const navigate = useNavigate();
  const c = configs[slug] || {
    title: label(slug),
    description: `Manage ${slug}.`,
    fields: [f("title", "Name", "text", true), f("description", "Description", "textarea"), stat],
    columns: ["title", "description", "status", "updatedAt"],
  };
  const qc = useQueryClient(),
    [edit, setEdit] = useState<any>(),
    [view, setView] = useState<any>(),
    [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [page, setPage] = useState(1);
  const base = mode === "admin" ? (slug === "registrations" || slug === "tenants" ? "/super-admin/tenants" : slug === "plans" ? "/super-admin/plans" : `/super-admin/modules/${slug}`) : actual[slug] ? `/crm/${actual[slug]}` : `/crm/modules/${slug}`,
    endpoint = c.fixedStatus ? `${base}?status=${c.fixedStatus}` : base;
  const { data, isLoading, error } = useQuery({
    queryKey: [endpoint],
    queryFn: () => api.get(endpoint).then(unwrap),
  });
  const referenceEndpoints: Record<string, string> = { doctorId: "/crm/doctors", branchId: "/crm/branches", departmentId: "/crm/departments", patientId: "/crm/patients", leadId: "/crm/leads", appointmentId: "/crm/appointments" };
  const referenceKeys = Object.keys(referenceEndpoints);
  const referenceQueries = useQueries({
    queries: referenceKeys.map((key) => ({ queryKey: ["table-ref", referenceEndpoints[key]], queryFn: () => api.get(`${referenceEndpoints[key]}?limit=100`).then(unwrap), enabled: mode === "tenant" })),
  });
  const display = (record: any, key: string) => {
    const raw = val(record, key), referenceIndex = referenceKeys.indexOf(key);
    if (referenceIndex < 0 || !raw) return show(raw);
    const referenceData = referenceQueries[referenceIndex].data as any;
    const referenceRows = Array.isArray(referenceData) ? referenceData : referenceData?.items || [];
    const match = referenceRows.find((item: any) => item.id === raw);
    return show(match?.name || match?.title || match?.patientNumber || match?.leadNumber || match?.appointmentNumber || raw);
  };
  const all = useMemo(() => {
    const x = (Array.isArray(data) ? data : data?.items || []).map((r: any) => (r.data ? { ...r, ...r.data } : r));
    const filtered = x.filter((r: any) => (filter === "ALL" || r.status === filter) && JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
    if (slug !== "doctor-schedules") return filtered;
    const groups = new Map<string, any[]>();
    for (const row of filtered) { const key = `${row.doctorId}:${row.branchId}`; groups.set(key, [...(groups.get(key) || []), row]); }
    return [...groups.values()].map(group => { const dated = group.filter(item => item.scheduleDate).sort((a,b) => a.scheduleDate.localeCompare(b.scheduleDate)); return { ...group[0], scheduleCount: dated.length, nextSchedule: dated.find(item => new Date(item.scheduleDate) >= new Date())?.scheduleDate || dated[0]?.scheduleDate }; });
  }, [data, search, filter, slug]);
  const pages = Math.max(1, Math.ceil(all.length / 10)),
    rows = all.slice((Math.min(page, pages) - 1) * 10, Math.min(page, pages) * 10);
  const save = useMutation({
      mutationFn: (body: any) => (edit ? api.patch(`${base}/${edit.id}`, body) : api.post(base, body)),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: [endpoint] });
        setEdit(undefined);
        setOpen(false);
      },
    }),
    del = useMutation({
      mutationFn: (id: string) => api.delete(`${base}/${id}`),
      onSuccess: () => qc.invalidateQueries({ queryKey: [endpoint] }),
    }),
    tenant = useMutation({
      mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) => api.patch(`/super-admin/tenants/${id}/status`, { status, reason }),
      onSuccess: () => qc.invalidateQueries({ queryKey: [endpoint] }),
    });
  const leadStatuses = ["NEW", "CONTACTED", "INTERESTED", "FOLLOW_UP_REQUIRED", "APPOINTMENT_PENDING", "CONVERTED", "NOT_INTERESTED", "CALLBACK_LATER", "INVALID", "LOST"];
  const statusOptions = mode === "tenant" && slug !== "doctor-schedules" ? (["leads", "interested-leads", "converted-leads"].includes(slug) ? leadStatuses : c.fields.find((field) => field.name === "status")?.options || []) : [];
  const changeStatus = useMutation({
    mutationFn: ({ row, status }: { row: any; status: string }) => (["leads", "interested-leads", "converted-leads"].includes(slug) ? api.patch(`/crm/leads/${row.id}/status`, { status }) : api.patch(`${base}/${row.id}`, { status })),
    onSuccess: () => qc.invalidateQueries(),
    onError: (statusError: any) => window.alert(statusError.response?.data?.message || "Unable to change status"),
  });
  const requestStatusChange = (row: any, status: string) => {
    if (status === row.status) return;
    const conversion = status === "CONVERTED" ? " This will also create a patient record automatically." : "";
    if (window.confirm(`Change ${row.name || row.title || "this record"} from ${label(row.status)} to ${label(status)}?${conversion}`)) changeStatus.mutate({ row, status });
  };
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      body: any = {};
    for (const x of c.fields) {
      const v = d.get(x.name);
      if (x.type === "reference" && v === "") {
        if (x.required) { window.alert(`Please select ${x.label}`); return; }
        continue;
      }
      body[x.name] = x.type === "checkbox" ? v === "on" : x.type === "number" && v !== "" ? Number(v) : v;
    }
    save.mutate(body);
  };
  const statuses = [...new Set(all.map((r: any) => r.status).filter(Boolean))] as string[];
  const csv = () => {
    const blob = new Blob([[c.columns.map(label).join(","), ...all.map((r: any) => c.columns.map((k) => `"${display(r, k).replaceAll('"', '""')}"`).join(","))].join("\n")], { type: "text/csv" }),
      u = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = u;
    a.download = `${slug}.csv`;
    a.click();
    URL.revokeObjectURL(u);
  };
  if (slug === "doctor-schedules" && edit) return <DoctorScheduleEditor schedule={edit} onBack={() => setEdit(undefined)} />;
  return (
    <>
      <div className="page-head">
        <div>
          <span>{mode === "admin" ? "PLATFORM MANAGEMENT" : "CLINIC MANAGEMENT"}</span>
          <h1>{c.title}</h1>
          <p>{c.description}</p>
        </div>
        {!c.noCreate && (
          <button className="btn" onClick={() => slug === "appointments" ? navigate("/app/appointments/new") : setOpen(true)}>
            <Plus /> Add record
          </button>
        )}
      </div>
      <section className="panel table-panel">
        <div className="toolbar">
          <div className="search">
            <Search />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${c.title.toLowerCase()}…`} />
          </div>
          <div className="filter-select">
            <Filter />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <button className="btn ghost" onClick={csv}>
            <Download /> Export
          </button>
        </div>
        {isLoading ? (
          <div className="state">Loading live data…</div>
        ) : error ? (
          <div className="state error">{(error as any).response?.data?.message || "Unable to load data"}</div>
        ) : !rows.length ? (
          <div className="empty">
            <CheckCircle2 />
            <h3>No {c.title.toLowerCase()} yet</h3>
            <p>Records will appear here automatically.</p>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {c.columns.map((k) => (
                      <th key={k}>{label(k)}</th>
                    ))}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r: any) => (
                    <tr key={r.id}>
                      {c.columns.map((k) => (
                        <td key={k}>
                          <span className={k === "status" ? "status-pill" : ""}>{display(r, k)}</span>
                        </td>
                      ))}
                      <td>
                        <div className="row-actions">
                          {!!statusOptions.length && r.status && (
                            <select className="quick-status" value={r.status} disabled={changeStatus.isPending} onChange={(event) => { const nextStatus = event.target.value; event.currentTarget.value = r.status; requestStatusChange(r, nextStatus); }} aria-label={`Change status for ${r.name || r.title || "record"}`}>
                              {statusOptions.map((status) => (
                                <option key={status} value={status}>{label(status)}</option>
                              ))}
                            </select>
                          )}
                          <button onClick={() => setView(r)}>
                            <Eye />
                          </button>
                          {!c.readOnly && (
                            <button onClick={() => setEdit(r)}>
                              <SquarePen />
                            </button>
                          )}
                          {mode === "admin" && ["registrations", "tenants"].includes(slug) && (
                            <>
                              <button
                                className="approve"
                                onClick={() =>
                                  tenant.mutate({
                                    id: r.id,
                                    status: "ACTIVE",
                                  })
                                }
                              >
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  tenant.mutate({
                                    id: r.id,
                                    status: "SUSPENDED",
                                    reason: prompt("Reason") || undefined,
                                  })
                                }
                              >
                                Suspend
                              </button>
                            </>
                          )}
                          {!c.readOnly && slug !== "doctor-schedules" && (
                            <button className="danger" onClick={() => confirm("Delete permanently?") && del.mutate(r.id)}>
                              <Trash2 />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>{all.length} records</span>
              <div>
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft />
                </button>
                <b>
                  Page {Math.min(page, pages)} of {pages}
                </b>
                <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      {(open || edit) && (
        <div className="modal-bg">
          <form className="modal" onSubmit={submit}>
            <div className="modal-head">
              <h2>
                {edit ? "Edit" : "Add"} {c.title}
              </h2>
              <button
                type="button"
                className="icon"
                onClick={() => {
                  setOpen(false);
                  setEdit(undefined);
                }}
              >
                <X />
              </button>
            </div>
            {slug === "appointments" ? <AppointmentFields appointment={edit} /> : <div className="modal-grid">
              {c.fields.map((x) => (
                <label key={x.name} className={x.type === "textarea" ? "wide" : ""}>
                  {x.label}
                  {x.type === "textarea" ? (
                    <textarea name={x.name} required={x.required} defaultValue={val(edit || {}, x.name) || ""} />
                  ) : x.type === "select" ? (
                    <select name={x.name} required={x.required} defaultValue={String(val(edit || {}, x.name) ?? x.options?.[0] ?? "")}>
                      {x.options?.map((o) => (
                        <option key={o} value={o}>
                          {label(o)}
                        </option>
                      ))}
                    </select>
                    ) : x.type === "reference" ? (
                      x.name === "patientId" ? <PatientSearchRef field={x} value={val(edit || {}, x.name)} /> : <Ref field={x} value={val(edit || {}, x.name)} />
                  ) : x.type === "checkbox" ? (
                    <input name={x.name} type="checkbox" defaultChecked={!!val(edit || {}, x.name)} />
                  ) : (
                    <input name={x.name} type={x.type} required={x.required} defaultValue={val(edit || {}, x.name) || ""} />
                  )}
                </label>
              ))}
            </div>}
            {save.error && <div className="alert error">{(save.error as any).response?.data?.message || "Unable to save"}</div>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setOpen(false);
                  setEdit(undefined);
                }}
              >
                Cancel
              </button>
              <button className="btn">Save record</button>
            </div>
          </form>
        </div>
      )}
      {view && (
        <div className="modal-bg">
          <div className="modal detail-modal">
            <div className="modal-head">
              <h2>{c.title} details</h2>
              <button className="icon" onClick={() => setView(undefined)}>
                <X />
              </button>
            </div>
            <dl>
              {c.columns.map((k) => (
                <div key={k}>
                  <dt>{label(k)}</dt>
                  <dd>{display(view, k)}</dd>
                </div>
              ))}
            </dl>
            <button className="btn full" onClick={() => setView(undefined)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
