import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api";
import "./Accounts.css";

type Row = { id: string; appointment: string; date: string; patient: string; mobile: string; patientNumber: string; service: string; department: string; branch: string; status: string; paymentStatus: string; methods: string; gross: number; discount: number; charge: number; billable: number; collected: number | null; refunded: number; netCollected: number | null; outstanding: number | null; estimatedCommission: number; commissionType: string; commissionValue: number; note: string };
type Report = { items: Row[]; currency: string; timezone: string };
const titles = { doctor: "Doctor Appointment Wise", lab: "Lab Appointment Wise", radiology: "Radiology Appointment Wise" };
const pretty = (value: string) => value.replaceAll("_", " ");
export function AccountsPage({ kind }: { kind: keyof typeof titles }) {
  const [search, setSearch] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [status, setStatus] = useState(""), [payment, setPayment] = useState(""), [service, setService] = useState(""), [branch, setBranch] = useState(""), [page, setPage] = useState(1), [exportError, setExportError] = useState("");
  const { data, isLoading, error, refetch, isFetching } = useQuery<Report>({ queryKey: ["accounts", kind], queryFn: () => api.get(`/crm/accounts/${kind}`).then(unwrap) });
  const rows = data?.items || [], timezone = data?.timezone || "Asia/Kolkata", currency = data?.currency || "INR";
  const day = (date: string) => new Date(date).toLocaleDateString("en-CA", { timeZone: timezone });
  const money = (amount: number | null) => amount === null ? "Unknown" : `${currency} ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const invalidRange = !!from && !!to && from > to;
  const filtered = useMemo(() => rows.filter((row) => !invalidRange && (!from || day(row.date) >= from) && (!to || day(row.date) <= to) && (!status || row.status === status) && (!payment || row.paymentStatus === payment) && (!service || row.service === service) && (!branch || row.branch === branch) && [row.patient, row.mobile, row.patientNumber, row.appointment, row.service, row.department, row.methods].join(" ").toLowerCase().includes(search.trim().toLowerCase())), [rows, from, to, status, payment, service, branch, search, timezone, invalidRange]);
  useEffect(() => setPage(1), [search, from, to, status, payment, service, branch]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25)), currentPage = Math.min(page, pages), visible = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const totals = filtered.reduce((sum, row) => {
    for (const key of ["gross", "discount", "charge", "billable", "collected", "refunded", "netCollected", "outstanding", "estimatedCommission"] as const) sum[key] = Math.round((sum[key] + (row[key] ?? 0)) * 100) / 100;
    return sum;
  }, { gross: 0, discount: 0, charge: 0, billable: 0, collected: 0, refunded: 0, netCollected: 0, outstanding: 0, estimatedCommission: 0 });
  const incomplete = filtered.filter((r) => r.collected === null).length;
  const columns: [string, (row: Row) => string][] = [
    ["Appointment date", (r) => new Date(r.date).toLocaleString("en-IN", { timeZone: timezone })], ["Appointment", (r) => r.appointment], ["Patient", (r) => `${r.patient} (${r.patientNumber || r.mobile})`], [kind === "doctor" ? "Doctor" : "Tests", (r) => r.service],
    ...(kind === "doctor" ? [["Department", (r: Row) => r.department], ["Branch", (r: Row) => r.branch]] as [string, (r: Row) => string][] : []),
    ["Appointment status", (r) => pretty(r.status)], ["Payment status", (r) => pretty(r.paymentStatus)], ["Method", (r) => r.methods], ["Gross charge", (r) => money(r.gross)], ["Discount", (r) => money(r.discount)], ["Net charge", (r) => money(r.charge)], ["Billable", (r) => money(r.billable)], ["Collected", (r) => money(r.collected)], ["Refunded", (r) => money(r.refunded)], ["Net collected", (r) => money(r.netCollected)], ["Outstanding", (r) => money(r.outstanding)],
    ...(kind === "doctor" ? [["Commission setting", (r: Row) => r.commissionType === "PERCENTAGE" ? `${r.commissionValue}%` : `Flat ${money(r.commissionValue)}`], ["Estimated commission", (r: Row) => money(r.estimatedCommission)]] as [string, (r: Row) => string][] : []), ["Review note", (r) => r.note],
  ];
  const csv = () => {
    const safe = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const lines = [columns.map(([name]) => name), ...filtered.map((r) => columns.map(([, value]) => value(r)))];
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.map((line) => line.map(safe).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${kind}-appointment-accounts.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const pdf = async () => {
    setExportError("");
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const doc = new jsPDF({ orientation: "landscape", format: "a3" });
      doc.setFontSize(16); doc.text(`${titles[kind]} — Accounts`, 14, 15);
      doc.setFontSize(9); doc.text(`Appointment dates: ${from || "All"} to ${to || "All"} | ${filtered.length} records | Currency: ${currency}`, 14, 23);
      doc.text(`Billable: ${money(totals.billable)} | Net collected: ${money(totals.netCollected)} | Outstanding: ${money(totals.outstanding)}${incomplete ? ` | ${incomplete} incomplete records excluded from collection totals` : ""}`, 14, 30);
      doc.text(kind === "doctor" ? "Commission is an estimate using current settings on appointment fees; excludes cancelled/refunded/no-charge appointments. Payouts are not tracked." : "Collections use recorded payment status. Partial payments without an amount are Unknown. Refund status is treated as a full refund.", 14, 37);
      autoTable(doc, { startY: 43, head: [columns.map(([name]) => name)], body: filtered.map((r) => columns.map(([, value]) => value(r))), styles: { fontSize: 6, cellPadding: 2 }, horizontalPageBreak: true });
      doc.save(`${kind}-appointment-accounts.pdf`);
    } catch { setExportError("Unable to export PDF. Please try again."); }
  };
  const options = (key: "service" | "branch" | "status" | "paymentStatus") => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
  return <div className="accounts-page">
    <div className="page-head"><div><span>ACCOUNTS</span><h1>{titles[kind]}</h1><p>Financial report by appointment date. Dates use {timezone}.</p></div><div className="accounts-actions"><button className="btn ghost" onClick={() => refetch()} disabled={isFetching}>Refresh</button><button className="btn ghost" onClick={csv} disabled={!filtered.length || !!error}>Export CSV</button><button className="btn ghost" onClick={pdf} disabled={!filtered.length || !!error}>Export PDF</button></div></div>
    <section className="panel accounts-filters">
      <label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient, appointment, doctor or test"/></label>
      <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}/></label>
      <label>{kind === "doctor" ? "Doctor" : "Tests"}<select value={service} onChange={(e) => setService(e.target.value)}><option value="">All</option>{options("service").map((v) => <option key={v}>{v}</option>)}</select></label>
      {kind === "doctor" && <label>Branch<select value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">All branches</option>{options("branch").map((v) => <option key={v}>{v}</option>)}</select></label>}
      <label>Appointment status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{options("status").map((v) => <option value={v} key={v}>{pretty(v)}</option>)}</select></label><label>Payment status<select value={payment} onChange={(e) => setPayment(e.target.value)}><option value="">All</option>{options("paymentStatus").map((v) => <option value={v} key={v}>{pretty(v)}</option>)}</select></label>
      <button className="btn ghost" onClick={() => { setSearch(""); setFrom(""); setTo(""); setStatus(""); setPayment(""); setService(""); setBranch(""); }}>Clear filters</button>
    </section>
    {invalidRange && <div className="alert error">From date must be on or before To date.</div>}
    {exportError && <div className="alert error">{exportError}</div>}
    {isLoading ? <div className="state">Loading accounts…</div> : error ? <div className="state error">{(error as any).response?.data?.message || "Unable to load accounts."}</div> : <>
      <div className="accounts-summary">{[["Appointments", String(filtered.length)], ["Gross charges", money(totals.gross)], ["Discounts", money(totals.discount)], ["Net charges", money(totals.charge)], ["Billable", money(totals.billable)], ["Collected", money(totals.collected)], ["Refunded", money(totals.refunded)], ["Net collected", money(totals.netCollected)], ["Outstanding", money(totals.outstanding)], ...(kind === "doctor" ? [["Estimated commission", money(totals.estimatedCommission)]] : [])].map(([name, value]) => <article className="panel" key={name}><small>{name}</small><strong>{value}</strong></article>)}</div>
      <p className="accounts-note">Totals cover all filtered appointments. Billable excludes cancelled, refunded and no-charge appointments. Collections reflect recorded payments or paid status; refunded status represents a full refund. This is an appointment report, not a cash-flow statement.</p>
      {kind === "doctor" && <p className="accounts-note">Commission is estimated from appointment fees using each doctor’s current setting. It excludes cancelled, refunded and no-charge appointments. Historical commission rates and payouts are not recorded.</p>}
      {incomplete > 0 && <div className="alert error">{incomplete} appointment(s) lack a partial payment amount. Collection and outstanding totals exclude their unknown values and are incomplete.</div>}
      <section className="panel table-panel"><div className="table-wrap"><table><thead><tr>{columns.map(([name]) => <th key={name}>{name}</th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id}>{columns.map(([name, value]) => <td key={name}>{value(row) || "—"}</td>)}</tr>)}</tbody></table>{!filtered.length && <div className="state">No appointments match these filters.</div>}</div>
        <nav className="pagination" aria-label="Accounts pagination"><span>{filtered.length ? (currentPage - 1) * 25 + 1 : 0}–{Math.min(currentPage * 25, filtered.length)} of {filtered.length} appointments</span><div><button disabled={currentPage === 1} onClick={() => setPage(1)}>First</button><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button><button disabled={currentPage === pages} onClick={() => setPage(pages)}>Last</button></div></nav>
      </section>
    </>}
  </div>;
}
