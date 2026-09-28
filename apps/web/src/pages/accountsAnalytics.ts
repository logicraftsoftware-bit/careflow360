export type FinancialRow = { date: string; service: string; status: string; paymentStatus: string; gross: number; charge: number; collected: number | null; netCollected: number | null; outstanding: number | null };
const round = (n: number) => Math.round(n * 100) / 100;
export const accountDay = (date: string | Date, timezone: string) => new Date(date).toLocaleDateString("en-CA", { timeZone: timezone });
export function accountRange(preset: string, timezone: string, now = new Date()) {
  const today = accountDay(now, timezone), [year, month] = today.split("-").map(Number);
  if (preset === "Today") return [today, today];
  if (preset === "Yesterday") { const day = new Date(`${today}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - 1); return [day.toISOString().slice(0, 10), day.toISOString().slice(0, 10)]; }
  if (preset === "This Month") return [`${today.slice(0, 7)}-01`, new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)];
  if (preset === "This Year") return [`${year}-01-01`, `${year}-12-31`];
  return ["", ""];
}
export function financialTrend(rows: FinancialRow[], from: string, to: string, timezone: string, monthly: boolean) {
  const dates = rows.map((r) => accountDay(r.date, timezone)).sort();
  const start = from || dates[0], end = to || dates.at(-1);
  if (!start || !end || start > end) return [];
  const byMonth = monthly || (Date.parse(end) - Date.parse(start)) / 86400000 > 366;
  const buckets = new Map<string, { date: string; gross: number; charge: number; collected: number | null; unknown: boolean }>();
  const cursor = new Date(`${byMonth ? start.slice(0, 7) + "-01" : start}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) <= end) {
    const date = cursor.toISOString().slice(0, byMonth ? 7 : 10);
    buckets.set(date, { date, gross: 0, charge: 0, collected: 0, unknown: false });
    if (byMonth) cursor.setUTCMonth(cursor.getUTCMonth() + 1); else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const r of rows) {
    const day = accountDay(r.date, timezone); if (day < start || day > end) continue;
    const bucket = buckets.get(day.slice(0, byMonth ? 7 : 10)); if (!bucket) continue;
    bucket.gross = round(bucket.gross + r.gross); bucket.charge = round(bucket.charge + r.charge);
    if (r.collected === null) bucket.unknown = true; else bucket.collected = round((bucket.collected || 0) + r.collected);
  }
  return [...buckets.values()].map((b) => ({ ...b, collected: b.unknown ? null : b.collected }));
}
export function financialRanking(rows: FinancialRow[]) {
  const groups = new Map<string, { name: string; appointments: number; gross: number; collected: number; outstanding: number; incomplete: boolean }>();
  for (const r of rows) {
    const group = groups.get(r.service) || { name: r.service, appointments: 0, gross: 0, collected: 0, outstanding: 0, incomplete: false };
    group.appointments++; group.gross = round(group.gross + r.gross); group.collected = round(group.collected + (r.collected ?? 0)); group.outstanding = round(group.outstanding + (r.outstanding ?? 0)); group.incomplete ||= r.collected === null || r.outstanding === null;
    groups.set(r.service, group);
  }
  return [...groups.values()];
}
