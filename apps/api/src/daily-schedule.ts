export const DAILY_SCHEDULE = {
  sessionPeriod: "DAILY",
  startTime: "07:00",
  endTime: "22:00",
  slotMinutes: 30,
  maxPatients: 30,
} as const;

type MigrationRow = {
  id: string; status: string; sessionPeriod: string | null;
  startTime: string; endTime: string; slotMinutes: number; maxPatients: number;
};

export function planDailyScheduleBatch(groups: MigrationRow[][]) {
  const activeIds: string[] = [], inactiveIds: string[] = [], duplicateIds: string[] = [];
  for (const [first, ...duplicates] of groups) {
    const status = [first, ...duplicates].some(row => row.status === "ACTIVE") ? "ACTIVE" : "INACTIVE";
    if (first.status !== status || Object.entries(DAILY_SCHEDULE).some(([key, value]) => first[key as keyof typeof DAILY_SCHEDULE] !== value)) {
      (status === "ACTIVE" ? activeIds : inactiveIds).push(first.id);
    }
    duplicateIds.push(...duplicates.map(row => row.id));
  }
  return { activeIds, inactiveIds, duplicateIds };
}

// Keep one row per doctor, branch and date when converting legacy sessions.
export function groupDailySchedules<T extends { tenantId: string; doctorId: string; branchId: string; scheduleDate: Date | null; dayOfWeek: number }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.tenantId}:${row.doctorId}:${row.branchId}:${row.scheduleDate?.toISOString().slice(0, 10) ?? `weekday-${row.dayOfWeek}`}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()];
}
