export const DAILY_SCHEDULE = {
  sessionPeriod: "DAILY",
  startTime: "07:00",
  endTime: "22:00",
  slotMinutes: 30,
  maxPatients: 30,
} as const;

// Keep one row per doctor, branch and date when converting legacy sessions.
export function groupDailySchedules<T extends { tenantId: string; doctorId: string; branchId: string; scheduleDate: Date | null; dayOfWeek: number }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.tenantId}:${row.doctorId}:${row.branchId}:${row.scheduleDate?.toISOString().slice(0, 10) ?? `weekday-${row.dayOfWeek}`}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()];
}
