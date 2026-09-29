import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
export const rupees = (value: unknown) => value == null ? "Not recorded" : `INR ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (value: string) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-";
const clean = (text: unknown) => String(text ?? "-");
function logo(doc: jsPDF, url: string | undefined, x: number, y: number, size: number) {
  if (url?.startsWith("data:image/")) { try { doc.addImage(url, x, y, size, size); } catch { /* Clinic name remains visible if logo cannot be rendered. */ } }
}
export function downloadDiagnosticInvoice(data: any, receipt?: any) {
  const doc = new jsPDF();
  const clinic = data.clinic || {}, patient = data.patient || {}, snapshot = receipt || data;
  logo(doc, clinic.logoUrl, 12, 10, 22);
  doc.setFont("helvetica", "bold").setFontSize(15).text(clean(clinic.name), 105, 17, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(doc.splitTextToSize(clean(clinic.address), 142), 105, 24, { align: "center" });
  doc.text(`Phone: ${clean(clinic.mobile)}`, 105, 35, { align: "center" });
  doc.setDrawColor(100).line(12, 40, 198, 40);
  doc.setFont("helvetica", "bold").setFontSize(12).text(receipt ? "MONEY RECEIPT / PAYMENT INVOICE" : "LAB INVOICE", 105, 48, { align: "center" });
  autoTable(doc, { startY: 53, theme: "plain", styles: { fontSize: 9, cellPadding: 2 }, margin: { left: 12, right: 12 }, body: [
    [`UHID: ${clean(patient.patientNumber)}`, `Bill No: ${data.title}`],
    [`Name: ${clean(patient.name)}`, `Date: ${date(receipt?.createdAt || data.createdAt)}`],
    [`Age / Sex: ${clean(patient.age)} / ${clean(patient.gender)}`, `Phone: ${clean(patient.mobile)}`],
    [`Ref By: ${clean(data.referringDoctorName)}`, `Token: ${data.tokenNumber}`],
    [`Address: ${clean(patient.address)}`, receipt ? `Receipt: ${receipt.number}` : `Status: ${data.paymentStatus || "PENDING"}`],
  ] });
  const tests = snapshot.tests?.length ? snapshot.tests : [{ title: snapshot.testNames || data.testNames || "Diagnostic tests" }];
  autoTable(doc, { startY: (doc as any).lastAutoTable.finalY + 4, margin: { left: 12, right: 12 }, theme: "grid", head: [["No.", "Investigation", "Amount"]],
    body: tests.map((test: any, index: number) => [index + 1, test.title || test.name, test.price == null ? "-" : rupees(test.price)]),
    styles: { fontSize: 9, cellPadding: 3, lineColor: [215, 220, 225], lineWidth: 0.1 }, headStyles: { fillColor: [244, 247, 249], textColor: [25, 35, 45] }, columnStyles: { 0: { cellWidth: 12 }, 2: { halign: "right", cellWidth: 38 } } });
  const total = receipt ? receipt.total : data.amount;
  autoTable(doc, { startY: (doc as any).lastAutoTable.finalY + 3, theme: "plain", margin: { left: 100, right: 12 }, styles: { fontSize: 10, cellPadding: 2.5 }, columnStyles: { 1: { halign: "right" } }, body: [
    ["Total amount", rupees(snapshot.subtotal ?? total)], ["Discount", rupees(snapshot.discountAmount || 0)], ["Net payable", rupees(total)],
    ...(receipt ? [["Previously received", rupees(receipt.previousCollected)], ["Paid this receipt", rupees(receipt.amount)]] : []),
    ["Total received", rupees(snapshot.collectedAmount)], ["Remaining balance", rupees(snapshot.remainingAmount)],
  ] });
  let y = (doc as any).lastAutoTable.finalY + 9;
  if (y > 248) { doc.addPage(); y = 20; }
  doc.setFontSize(9).text(`Payment method: ${clean(receipt?.method || data.paymentMethod).replaceAll("_", " ")}`, 12, y);
  doc.text(`Reference: ${clean(receipt?.reference || data.paymentReference || "-")}`, 12, y + 6);
  doc.text(receipt ? "This receipt records only the payment shown above." : "An invoice is not proof of payment. See payment receipts for amounts received.", 12, y + 15);
  doc.setFont("helvetica", "bold").text(`For ${clean(clinic.name)}`, 198, y + 29, { align: "right" });
  doc.setFont("helvetica", "normal").text("Computer-generated document", 198, y + 35, { align: "right" });
  doc.save(`${receipt?.number || data.title}-invoice.pdf`);
}
export function downloadDiagnosticToken(data: any) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });
  doc.setFillColor(240, 250, 255).rect(0, 0, 210, 148, "F");
  doc.setFillColor(0, 129, 200).rect(0, 0, 210, 7, "F");
  doc.setFillColor(52, 192, 45).rect(0, 141, 210, 7, "F");
  logo(doc, data.clinic?.logoUrl, 12, 13, 22);
  doc.setTextColor(0, 91, 150).setFont("helvetica", "bold").setFontSize(20).text(doc.splitTextToSize(clean(data.clinic?.name), 160), 119, 25, { align: "center" });
  doc.setFillColor(0, 119, 186).roundedRect(12, 39, 186, 20, 4, 4, "F");
  doc.setTextColor(255, 255, 255).setFontSize(20).text(`${data.kind.toUpperCase()} APPOINTMENT TOKEN`, 105, 52, { align: "center" });
  doc.setFillColor(255, 255, 255).roundedRect(25, 64, 160, 29, 4, 4, "F");
  doc.setTextColor(12, 36, 74).setFontSize(27).text(data.tokenNumber, 105, 83, { align: "center" });
  doc.setFontSize(12).text(doc.splitTextToSize(`Patient: ${clean(data.patient?.name)}`, 174), 18, 105);
  doc.setFont("helvetica", "normal").setFontSize(11).text(`Appointment: ${date(data.appointmentAt)}`, 18, 118);
  doc.text(`Department: ${data.kind === "Lab" ? "Laboratory" : "Radiology"}`, 18, 126);
  doc.setFontSize(10).text("Please wait for your turn. Keep this token for your appointment.", 105, 136, { align: "center" });
  doc.save(`${data.title}-token.pdf`);
}
