export type AnalyticsAppointment = { id: string; startsAt: string; status: string; paymentStatus: string; amount?: number; doctorId?: string; departmentId?: string; doctor?: { name: string }; department?: { name: string } };
export const appointmentDay = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
export function appointmentRange(preset: string, now = new Date()) {
  const today = appointmentDay(now), [year, month] = today.split("-").map(Number);
  if (preset === "Today") return [today, today];
  if (preset === "Yesterday") { const yesterday = new Date(`${today}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1); return [yesterday.toISOString().slice(0, 10), yesterday.toISOString().slice(0, 10)]; }
  if (preset === "This Month") return [`${today.slice(0, 7)}-01`, new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)];
  if (preset === "This Year") return [`${year}-01-01`, `${year}-12-31`];
  return ["", ""];
}
export const bookingGroup = (status: string) => ["DRAFT", "BOOKING_PENDING", "PAYMENT_PENDING"].includes(status) ? "Pending" : ({ CONFIRMED: "Confirmed", CHECKED_IN: "Checked in", IN_CONSULTATION: "In consultation", COMPLETED: "Completed", CANCELLED: "Cancelled", RESCHEDULED: "Rescheduled", NO_SHOW: "No show" } as Record<string, string>)[status] || status;
export const paymentGroup = (status: string) => ({ PAID: "Paid", PENDING: "Pending", PARTIALLY_PAID: "Partially paid", REFUNDED: "Refunded", FAILED: "Failed", NOT_REQUIRED: "Not required" } as Record<string, string>)[status] || status;
export function summarizeAppointments(rows: AnalyticsAppointment[]) {
  const counts = (field: "status" | "paymentStatus", group: (value: string) => string) => Object.entries(rows.reduce<Record<string, number>>((all, row) => { const key = group(row[field]); all[key] = (all[key] || 0) + 1; return all; }, {})).map(([name, value]) => ({ name, value }));
  return { total: rows.length, confirmed: rows.filter((r) => r.status === "CONFIRMED").length, pending: rows.filter((r) => bookingGroup(r.status) === "Pending").length, cancelled: rows.filter((r) => r.status === "CANCELLED").length, completed: rows.filter((r) => r.status === "COMPLETED").length,
    revenue: Math.round(rows.filter((r) => r.paymentStatus === "PAID").reduce((sum, r) => sum + Number(r.amount || 0), 0) * 100) / 100,
    bookings: counts("status", bookingGroup), payments: counts("paymentStatus", paymentGroup) };
}
export function appointmentTrend(rows: AnalyticsAppointment[], from: string, to: string, monthly: boolean) {
  const valid = rows.filter((r) => r.startsAt && Number.isFinite(new Date(r.startsAt).getTime()));
  const days = valid.map((r) => appointmentDay(r.startsAt)).sort();
  const start = from || days[0], end = to || days.at(-1);
  if (!start || !end || start > end) return [];
  // Use monthly buckets for long custom/all-time ranges to keep the chart readable.
  const byMonth = monthly || (Date.parse(end) - Date.parse(start)) / 86400000 > 366;
  const buckets = new Map<string, { date: string; total: number; completed: number }>();
  const cursor = new Date(`${byMonth ? `${start.slice(0, 7)}-01` : start}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= end) {
    const key = cursor.toISOString().slice(0, byMonth ? 7 : 10);
    buckets.set(key, { date: key, total: 0, completed: 0 });
    if (byMonth) cursor.setUTCMonth(cursor.getUTCMonth() + 1); else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const row of valid) { const day = appointmentDay(row.startsAt); if (day < start || day > end) continue; const bucket = buckets.get(day.slice(0, byMonth ? 7 : 10)); if (bucket) { bucket.total++; if (row.status === "COMPLETED") bucket.completed++; } }
  return [...buckets.values()];
}
