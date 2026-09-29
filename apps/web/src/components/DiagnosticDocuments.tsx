import { ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Download, FlaskConical, ReceiptText, UserRound, Wallet } from "lucide-react";
import "./DiagnosticDocuments.css";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api";
import { downloadDiagnosticInvoice, downloadDiagnosticToken, rupees } from "./diagnosticPdf";
export function DiagnosticDocuments({ id, confirmation = false, onBack }: { id: string; confirmation?: boolean; onBack?: () => void }) {
  const [downloadError, setDownloadError] = useState("");
  const endpoint = `/crm/diagnostic-appointments/${id}`;
  const { data, isLoading, error } = useQuery({ queryKey: [endpoint, "documents"], queryFn: () => api.get(`${endpoint}/documents`).then(unwrap) });
  if (isLoading) return <p>Loading invoice and token...</p>;
  if (error || !data) return <p role="alert">Unable to load appointment documents. Please refresh and try again.</p>;
  const download = (kind: "invoice" | "token", receipt?: any) => { setDownloadError(""); try { kind === "token" ? downloadDiagnosticToken(data) : downloadDiagnosticInvoice(data, receipt); } catch { setDownloadError("Unable to generate this document. Please try again."); } };
  const appointmentDate = data.appointmentAt ? new Date(data.appointmentAt) : null;
  const date = appointmentDate?.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) || "Not scheduled";
  const time = appointmentDate?.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) || "-";
  const status = String(data.paymentStatus || "PENDING").replaceAll("_", " ").toLowerCase();
  const department = data.kind === "Lab" ? "Laboratory" : "Radiology";
  return <section className={`diagnostic-documents ${confirmation ? "confirmation" : "compact"}`}>
    {confirmation && <>
      <nav className="dd-breadcrumb" aria-label="Breadcrumb"><span>Appointments</span><ChevronRight/><button onClick={onBack}>{data.kind} Appointments</button><ChevronRight/><strong>Booking Confirmation</strong></nav>
      <header className="dd-success"><span className="dd-success-check"><Check/></span><div><h1>{data.kind} Appointment Booked Successfully!</h1><p>The appointment has been booked and the token has been generated.</p></div><div className="dd-success-art" aria-hidden="true"><ClipboardCheck/><span><Check/></span></div></header>
    </>}
    {downloadError && <p className="alert error" role="alert">{downloadError}</p>}
    <div className="dd-grid">
      <article className="dd-card dd-details">
        <header className="dd-card-head"><span className="dd-icon blue"><CalendarDays/></span><div><h2>Appointment Details</h2><p>Here are the details of the booked appointment.</p></div></header>
        <div className="dd-detail-grid">
          <div className="dd-detail"><span className="dd-icon blue"><UserRound/></span><div><small>Patient Name</small><strong>{data.patient?.name || "Not recorded"}</strong></div></div>
          <div className="dd-detail"><span className="dd-icon purple"><ClipboardCheck/></span><div><small>Token Number</small><strong>{data.tokenNumber}</strong></div></div>
          <div className="dd-detail"><span className="dd-icon green"><ReceiptText/></span><div><small>Lab Test / Package</small><strong>{data.testNames || data.title}</strong><small>{data.title}</small></div></div>
          <div className="dd-detail"><span className="dd-icon green"><CalendarDays/></span><div><small>Appointment Date</small><strong>{date}</strong></div></div>
          <div className="dd-detail"><span className="dd-icon purple"><FlaskConical/></span><div><small>Department</small><strong>{department}</strong></div></div>
          <div className="dd-detail"><span className="dd-icon blue"><Clock3/></span><div><small>Appointment Time</small><strong>{time}</strong></div></div>
          <div className="dd-detail"><span className="dd-icon orange"><CheckCircle2/></span><div><small>Appointment Status</small><strong className="dd-badge">{String(data.status).replaceAll("_", " ")}</strong></div></div>
        </div>
      </article>
      <article className="dd-token">
        <header><FlaskConical/><h2>{data.kind.toUpperCase()} APPOINTMENT TOKEN</h2>{data.clinic?.logoUrl && <img src={data.clinic.logoUrl} alt={data.clinic.name}/>}</header>
        <div className="dd-token-number">{data.tokenNumber}</div>
        <div className="dd-token-meta"><div><CalendarDays/><span><b>{date}</b><small>Appointment Date</small></span></div><div><Clock3/><span><b>{time}</b><small>Appointment Time</small></span></div><div><FlaskConical/><span><b>{department}</b><small>Department</small></span></div></div>
        <button type="button" onClick={() => download("token")}><Download/> Download Token</button>
      </article>
      <article className="dd-card dd-summary">
        <header className="dd-card-head"><span className="dd-icon green"><Wallet/></span><div><h2>Payment Summary</h2><p>Payment details for this appointment.</p></div></header>
        <div className="dd-amounts"><div className="blue"><Wallet/><span><small>Total Amount</small><b>{rupees(data.amount)}</b></span></div><div className="green"><CheckCircle2/><span><small>Amount Received</small><b>{rupees(data.collectedAmount)}</b></span></div><div className="red"><Clock3/><span><small>Remaining Amount</small><b>{rupees(data.remainingAmount)}</b></span></div></div>
        <div className={`dd-payment-status ${data.paymentStatus === "PAID" ? "settled" : ""}`}><span><ReceiptText/>Payment Status</span><b>{status === "pending" ? "Pending payment" : status}</b></div>
      </article>

    </div>
    <div className="dd-actions"><button type="button" className="btn ghost dd-invoice" onClick={() => download("invoice")}><Download/> Download Invoice</button>{onBack && <button type="button" className="btn ghost" onClick={onBack}><ArrowLeft/>Back to Appointments</button>}</div>
    <article className="dd-card dd-receipts"><header className="dd-card-head"><span className="dd-icon purple"><ReceiptText/></span><div><h2>Payment Receipts</h2><p>A separate receipt for each payment received.</p></div></header>
      {!data.receipts.length ? <div className="dd-empty">No payments recorded yet. Receipts will appear here when a payment is received.</div> : <div className="table-wrap"><table><thead><tr><th>Receipt / date</th><th>Method</th><th>Paid</th><th>Balance after payment</th><th>Download</th></tr></thead><tbody>{data.receipts.map((receipt: any) => <tr key={receipt.id}><td>{receipt.number}<br/><small>{new Date(receipt.createdAt).toLocaleString()}</small></td><td>{receipt.method.replaceAll("_", " ")}</td><td>{rupees(receipt.amount)}</td><td>{rupees(receipt.remainingAmount)}</td><td><button type="button" className="btn ghost" onClick={() => download("invoice", receipt)}><Download/> Invoice</button></td></tr>)}</tbody></table></div>}
    </article>
  </section>;
}
