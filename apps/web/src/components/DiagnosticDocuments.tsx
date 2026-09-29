import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../api";
import { downloadDiagnosticInvoice, downloadDiagnosticToken, rupees } from "./diagnosticPdf";
export function DiagnosticDocuments({ id, onPaymentRecorded }: { id: string; onPaymentRecorded?: (payment: any) => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [downloadError, setDownloadError] = useState("");
  const endpoint = `/crm/diagnostic-appointments/${id}`;
  const { data, isLoading, error } = useQuery({ queryKey: [endpoint, "documents"], queryFn: () => api.get(`${endpoint}/documents`).then(unwrap) });
  const payment = useMutation({ mutationFn: () => api.post(`${endpoint}/payments`, { amount: Number(amount), method, reference, requestId }), onSuccess: (response) => {
    onPaymentRecorded?.(unwrap(response));
    setAmount(""); setReference(""); setRequestId(crypto.randomUUID()); qc.invalidateQueries({ queryKey: [endpoint, "documents"] });
    qc.invalidateQueries({ queryKey: ["/crm/modules/lab-appointments"] }); qc.invalidateQueries({ queryKey: ["/crm/modules/radiology-appointments"] });
  } });
  if (isLoading) return <p>Loading invoice and token...</p>;
  if (error || !data) return <p role="alert">Unable to load appointment documents. Please refresh and try again.</p>;
  const download = (kind: "invoice" | "token", receipt?: any) => { setDownloadError(""); try { kind === "token" ? downloadDiagnosticToken(data) : downloadDiagnosticInvoice(data, receipt); } catch { setDownloadError("Unable to generate this document. Please try again."); } };
  const submit = (event: FormEvent) => { event.preventDefault(); payment.mutate(); };
  return <section style={{ margin: "20px 0" }}>
    <h3>Invoice, token and payments</h3>
    <p>{data.patient?.name} ? {data.title} ? Token: <b>{data.tokenNumber}</b></p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <button type="button" className="btn" onClick={() => download("invoice")}>Download Invoice</button>
      <button type="button" className="btn ghost" onClick={() => download("token")}>Download Token</button>
    </div>
    {downloadError && <p role="alert">{downloadError}</p>}
    <p>Total: <b>{rupees(data.amount)}</b> ? Received: <b>{rupees(data.collectedAmount)}</b> ? Remaining: <b>{rupees(data.remainingAmount)}</b></p>
    <h3>Payment receipts</h3>
    {!data.receipts.length ? <p>No individual payment receipts are recorded for this appointment.</p> : <div className="table-wrap"><table><thead><tr><th>Receipt / date</th><th>Method</th><th>Paid</th><th>Balance after payment</th><th>Download</th></tr></thead><tbody>
      {data.receipts.map((receipt: any) => <tr key={receipt.id}><td>{receipt.number}<br/>{new Date(receipt.createdAt).toLocaleString()}</td><td>{receipt.method.replaceAll("_", " ")}</td><td>{rupees(receipt.amount)}</td><td>{rupees(receipt.remainingAmount)}</td><td><button type="button" className="btn ghost" onClick={() => download("invoice", receipt)}>Download Invoice</button></td></tr>)}
    </tbody></table></div>}
    {data.remainingAmount > 0 && data.status !== "CANCELLED" && data.paymentStatus !== "REFUNDED" && <form onSubmit={submit} style={{ marginTop: 20 }}>
      <h3>Receive remaining payment</h3>
      <div className="form-grid"><label>Amount received<input required type="number" min="0.01" step="0.01" max={data.remainingAmount} value={amount} onChange={(event) => setAmount(event.target.value)}/></label>
      <label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value)}><option>CASH</option><option>CARD</option><option>UPI</option><option>BANK_TRANSFER</option></select></label>
      <label>Reference (optional)<input value={reference} onChange={(event) => setReference(event.target.value)}/></label></div>
      {payment.error && <p role="alert">{(payment.error as any).response?.data?.message || "Unable to record payment"}</p>}
      <button className="btn" disabled={payment.isPending}>{payment.isPending ? "Saving..." : "Record payment and generate receipt"}</button>
    </form>}
  </section>;
}
