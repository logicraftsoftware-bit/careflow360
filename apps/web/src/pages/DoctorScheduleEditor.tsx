import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Save,
  Trash2,
} from "lucide-react";
import { api, unwrap } from "../api";
import "./DoctorScheduleEditor.css";

const weekDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const calculatedEndTime = (startTime: string, slotMinutes: number, maxPatients: number) => {
  const [hours, minutes] = startTime.split(":").map(Number);
  const total = hours * 60 + minutes + slotMinutes * maxPatients;
  if (!Number.isFinite(total) || total >= 24 * 60) return "Invalid";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
type ScheduleMode = "MONTHLY" | "WEEKLY" | "DAILY";
type SessionPeriod = "MORNING" | "EVENING";
type SessionForm = { startTime: string; slotMinutes: number; maxPatients: number; status: string };
const defaultSessionForms: Record<SessionPeriod, SessionForm> = {
  MORNING: { startTime: "09:00", slotMinutes: 15, maxPatients: 20, status: "ACTIVE" },
  EVENING: { startTime: "17:00", slotMinutes: 15, maxPatients: 20, status: "ACTIVE" },
};
function SessionFields({ period, form, onChange }: { period: SessionPeriod; form: SessionForm; onChange: (change: Partial<SessionForm>) => void }) {
  return <section className="session-form"><h3>{period === "MORNING" ? "Morning" : "Evening"} availability</h3>
    <label><span><Clock /> Start time</span><input type="time" value={form.startTime} onChange={(event) => onChange({ startTime: event.target.value })}/></label>
    <div className="schedule-form-row">
      <label><span>Slot duration</span><select value={form.slotMinutes} onChange={(event) => onChange({ slotMinutes: Number(event.target.value) })}>{[10,15,20,30,45,60].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
      <label><span>Maximum patients</span><input type="number" min="1" value={form.maxPatients} onChange={(event) => onChange({ maxPatients: Number(event.target.value) })}/></label>
    </div>
    <label><span>Status</span><select value={form.status} onChange={(event) => onChange({ status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
    <div className="slot-summary"><b>{period.toLowerCase()} slot summary</b><strong>{form.startTime} – {calculatedEndTime(form.startTime, form.slotMinutes, form.maxPatients)}</strong><span>{form.slotMinutes}-minute slots · {form.maxPatients} maximum patients</span></div>
  </section>;
}

export function DoctorScheduleEditor({
  schedule,
  onBack,
}: {
  schedule: any;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selected, setSelected] = useState<Date | null>(null);
  const [manualDates, setManualDates] = useState<Date[] | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<Date | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("MONTHLY");
  const [editingSingleDate, setEditingSingleDate] = useState(false);
  const [enabledSessions, setEnabledSessions] = useState<Record<SessionPeriod, boolean>>({ MORNING: true, EVENING: false });
  const [forms, setForms] = useState<Record<SessionPeriod, SessionForm>>(defaultSessionForms);
  const form = forms.MORNING;
  const setForm = (next: SessionForm) => setForms((current) => ({ ...current, MORNING: next }));
  const { data: schedulesData } = useQuery({
    queryKey: [
      "doctor-schedule-calendar",
      schedule.doctorId,
      schedule.branchId,
    ],
    queryFn: () =>
      api
        .get("/crm/doctor-schedule-calendar", {
          params: {
            doctorId: schedule.doctorId,
            branchId: schedule.branchId,
          },
        })
        .then(unwrap),
  });
  const { data: doctorsData } = useQuery({
    queryKey: ["schedule-doctors"],
    queryFn: () => api.get("/crm/doctors?limit=100").then(unwrap),
  });
  const { data: branchesData } = useQuery({
    queryKey: ["schedule-branches"],
    queryFn: () => api.get("/crm/branches?limit=100").then(unwrap),
  });
  const { data: appointmentsData } = useQuery({
    queryKey: ["schedule-appointments", schedule.doctorId, schedule.branchId],
    queryFn: () => api.get("/crm/appointments?limit=100").then(unwrap),
  });
  const { data: patientsData } = useQuery({
    queryKey: ["schedule-patients"],
    queryFn: () => api.get("/crm/patients?limit=100").then(unwrap),
  });
  const schedules = (schedulesData?.items || []).filter(
    (item: any) =>
      item.doctorId === schedule.doctorId &&
      item.branchId === schedule.branchId,
  );
  const doctor = (doctorsData?.items || []).find(
    (item: any) => item.id === schedule.doctorId,
  );
  const branch = (branchesData?.items || []).find(
    (item: any) => item.id === schedule.branchId,
  );
  const patients = patientsData?.items || [];
  const bookedAppointments = (appointmentsData?.items || [])
    .filter(
      (item: any) =>
        item.doctorId === schedule.doctorId &&
        item.branchId === schedule.branchId &&
        item.status !== "CANCELLED",
    )
    .sort(
      (a: any, b: any) =>
        new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  const bookedForDate = (date: string) =>
    bookedAppointments.filter(
      (item: any) => item.startsAt?.slice(0, 10) === date,
    ).length;
  const remainingForDate = (date: string, maximum: number) =>
    Math.max(0, Number(maximum) - bookedForDate(date));
  const sessionOf = (item: any): SessionPeriod => item.sessionPeriod === "EVENING" ? "EVENING" : "MORNING";
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1),
      start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);
  const selectedDates = useMemo(() => {
    if (manualDates?.length) return manualDates;
    if (!selected) return [];
    if (editingSingleDate || scheduleMode === "DAILY") return [selected];
    if (scheduleMode === "WEEKLY") {
      const start = new Date(selected);
      start.setDate(selected.getDate() - selected.getDay());
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return date;
      });
    }
    return Array.from(
      { length: new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate() },
      (_, index) => new Date(selected.getFullYear(), selected.getMonth(), index + 1),
    );
  }, [selected, scheduleMode, editingSingleDate, manualDates]);
  const selectedDateKeys = useMemo(
    () => new Set(selectedDates.map(isoDate)),
    [selectedDates],
  );
  const loadDateForm = (date: Date) => {
    setSelected(date);
    const existing = schedules.filter((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(date));
    const morning = existing.find((item: any) => sessionOf(item) === "MORNING");
    const evening = existing.find((item: any) => sessionOf(item) === "EVENING");
    setEnabledSessions(existing.length ? { MORNING: Boolean(morning), EVENING: Boolean(evening) } : { MORNING: true, EVENING: false });
    setForms({
      MORNING: morning ? { startTime: morning.startTime, slotMinutes: morning.slotMinutes, maxPatients: morning.maxPatients, status: morning.status } : defaultSessionForms.MORNING,
      EVENING: evening ? { startTime: evening.startTime, slotMinutes: evening.slotMinutes, maxPatients: evening.maxPatients, status: evening.status } : defaultSessionForms.EVENING,
    });
  };
  const selectDate = (date: Date, modifiers?: { ctrl?: boolean; shift?: boolean }) => {
    const ctrl = Boolean(modifiers?.ctrl), shift = Boolean(modifiers?.shift);
    if (shift && (selectionAnchor || selected)) {
      const anchor = selectionAnchor || selected!;
      const from = new Date(Math.min(anchor.getTime(), date.getTime()));
      const to = new Date(Math.max(anchor.getTime(), date.getTime()));
      const range: Date[] = [];
      for (const cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) range.push(new Date(cursor));
      setManualDates(range);
      setEditingSingleDate(false);
      loadDateForm(date);
      return;
    }
    if (ctrl) {
      const current = manualDates || (selected ? [selected] : []), key = isoDate(date);
      const exists = current.some((item) => isoDate(item) === key);
      const next = exists ? current.filter((item) => isoDate(item) !== key) : [...current, date];
      if (!next.length) {
        setManualDates(null);
        setSelected(null);
        setEditingSingleDate(false);
        return;
      }
      setManualDates(next.sort((a, b) => a.getTime() - b.getTime()));
      setSelectionAnchor(date);
      setEditingSingleDate(false);
      loadDateForm(date);
      return;
    }
    setManualDates(null);
    setSelectionAnchor(date);
    const existing = schedules.some((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(date));
    setEditingSingleDate(existing);
    loadDateForm(date);
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!selectedDates.length) throw new Error("Select a date first");
      const periods = (Object.keys(enabledSessions) as SessionPeriod[]).filter(period => enabledSessions[period]);
      if (!periods.length) throw new Error("Select morning, evening, or both");
      await Promise.all(selectedDates.flatMap((date) => periods.map((period) => {
        const form = forms[period];
        const existing = schedules.find(
          (item: any) => item.scheduleDate?.slice(0, 10) === isoDate(date) && sessionOf(item) === period,
        );
        const body = {
          doctorId: schedule.doctorId,
          branchId: schedule.branchId,
          dayOfWeek: date.getDay(),
          scheduleDate: isoDate(date),
          sessionPeriod: period,
          ...form,
          endTime: calculatedEndTime(form.startTime, Number(form.slotMinutes), Number(form.maxPatients)),
          slotMinutes: Number(form.slotMinutes),
          maxPatients: Number(form.maxPatients),
        };
        return existing
          ? api.patch(`/crm/doctorSchedules/${existing.id}`, body)
          : api.post("/crm/doctorSchedules", body);
      })));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["doctor-schedule-calendar"] });
      await qc.invalidateQueries({ queryKey: ["/crm/doctorSchedules"] });
      await qc.invalidateQueries({ queryKey: ["/crm/doctor-schedule-roster"] });
      const sessionCount = Object.values(enabledSessions).filter(Boolean).length;
      const count = selectedDates.length * sessionCount;
      window.alert(`${count} session${count === 1 ? "" : "s"} saved successfully`);
    },
  });
  const remove = useMutation({
    mutationFn: (period: SessionPeriod) => {
      if (!selected) throw new Error("Select a scheduled date first");
      const existing = schedules.find(
        (item: any) => item.scheduleDate?.slice(0, 10) === isoDate(selected) && sessionOf(item) === period,
      );
      if (!existing) throw new Error("No schedule exists for this date");
      return api.delete(`/crm/doctorSchedules/${existing.id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["doctor-schedule-calendar"] });
      await qc.invalidateQueries({ queryKey: ["/crm/doctorSchedules"] });
      await qc.invalidateQueries({ queryKey: ["/crm/doctor-schedule-roster"] });
      setSelected(null);
      window.alert("Schedule deleted successfully");
    },
  });
  const selectedSchedule = selected ? schedules.find((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(selected) && sessionOf(item) === "MORNING") : null;
  return (
    <div className="schedule-page">
      <button className="schedule-back" onClick={onBack}>
        <ArrowLeft /> Back to schedules
      </button>
      <div className="schedule-title">
        <div>
          <span>DOCTOR AVAILABILITY</span>
          <h1>{doctor?.name || "Doctor schedule"}</h1>
          <p>
            {branch?.name || "Branch"} · Configure availability separately for
            each calendar date.
          </p>
        </div>
        <div className="schedule-mode-control">
          <label htmlFor="schedule-mode">Scheduling mode</label>
          <select
            id="schedule-mode"
            value={scheduleMode}
            onChange={(event) => {
              setScheduleMode(event.target.value as ScheduleMode);
              setEditingSingleDate(false);
            }}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="WEEKLY">Weekly</option>
            <option value="DAILY">Daily</option>
          </select>
        </div>
      </div>
      <div className="schedule-layout">
        <section className="schedule-calendar panel">
          <div className="schedule-instructions"><b>Select multiple dates:</b> Hold <kbd>Ctrl</kbd> and click individual dates, or click one date then hold <kbd>Shift</kbd> and click another date to select the full range.</div>
          <div className="calendar-head">
            <button
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft />
            </button>
            <h2>
              {month.toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <button
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight />
            </button>
          </div>
          <div className="calendar-week">
            {weekDays.map((day) => (
              <b key={day}>{day.slice(0, 3)}</b>
            ))}
          </div>
          <div className="calendar-days">
            {cells.map((date) => {
              const dateSchedules = schedules.filter(
                  (item: any) =>
                    item.scheduleDate?.slice(0, 10) === isoDate(date) &&
                    item.status === "ACTIVE",
                ),
                active = dateSchedules.length > 0,
                outside = date.getMonth() !== month.getMonth(),
                chosen = selectedDateKeys.has(isoDate(date));
              return (
                <button
                  key={isoDate(date)}
                  className={`${active ? "scheduled" : ""} ${outside ? "outside" : ""} ${chosen ? "selected" : ""}`}
                  onClick={(event) => selectDate(date, { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey })}
                >
                  <span>{date.getDate()}</span>
                  {active && (
                    <i>
                      {dateSchedules.map(sessionOf).map((x: SessionPeriod) => x === "MORNING" ? "Morning" : "Evening").join(" + ")}{" "}
                      <em>
                        {dateSchedules.reduce((sum: number, item: any) => sum + item.maxPatients, 0)}{" "}
                        slots
                      </em>
                    </i>
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="schedule-editor panel">
          <h2>
            {selected && selectedDates.length > 1
              ? `${selectedDates.length} dates selected`
              : selected
              ? selected.toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "Select a date"}
          </h2>
          {!selected ? (
            <div className="schedule-empty">
              <CalendarDays />
              <p>
                Click any date in the calendar to view or update its schedule.
              </p>
            </div>
          ) : (
            <>
              <div className="schedule-note">
                This availability applies to{" "}
                <strong>
                  {selectedDates.length === 1
                    ? selected.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                    : scheduleMode === "MONTHLY"
                      ? `all ${selectedDates.length} days of ${selected.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`
                      : `${selectedDates[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} to ${selectedDates[selectedDates.length - 1].toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                </strong>
                .
              </div>
              <div className="session-selectors">
                {(["MORNING", "EVENING"] as SessionPeriod[]).map((period) => (
                  <label key={period} className={enabledSessions[period] ? "selected" : ""}>
                    <input type="checkbox" checked={enabledSessions[period]} onChange={(event) => setEnabledSessions({ ...enabledSessions, [period]: event.target.checked })}/>
                    {period === "MORNING" ? "Morning session" : "Evening session"}
                  </label>
                ))}
              </div>
              {enabledSessions.MORNING && <section className="session-form"><h3>Morning availability</h3>
              <label>
                <span>
                  <Clock /> Start time
                </span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                />
              </label>
              <div className="schedule-form-row">
                <label>
                  <span>Slot duration</span>
                  <select
                    value={form.slotMinutes}
                    onChange={(e) =>
                      setForm({ ...form, slotMinutes: Number(e.target.value) })
                    }
                  >
                    <option value="10">10 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="20">20 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </label>
                <label>
                  <span>Maximum patients</span>
                  <input
                    type="number"
                    min="1"
                    value={form.maxPatients}
                    onChange={(e) =>
                      setForm({ ...form, maxPatients: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                <span>Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              <div className="slot-summary">
                <b>Slot summary</b>
                <strong>
                  {form.startTime} – {calculatedEndTime(
                    form.startTime,
                    Number(form.slotMinutes),
                    Number(form.maxPatients),
                  )}
                </strong>
                <span>
                  {form.slotMinutes}-minute slots ·{" "}
                  {remainingForDate(isoDate(selected), form.maxPatients)} slots
                  remaining of {form.maxPatients}
                </span>
              </div>
              </section>}
              {enabledSessions.EVENING && <SessionFields period="EVENING" form={forms.EVENING} onChange={(change) => setForms({ ...forms, EVENING: { ...forms.EVENING, ...change } })} />}
              {selected && schedules.some((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(selected) && sessionOf(item) === "EVENING") && <button className="delete-session" disabled={remove.isPending} onClick={() => window.confirm(`Delete the evening session for ${selected.toLocaleDateString("en-IN")}?`) && remove.mutate("EVENING")}><Trash2 /> Delete evening session</button>}
              {(save.error || remove.error) && (
                <div className="alert error">
                  {((save.error || remove.error) as any).response?.data
                    ?.message ||
                    ((save.error || remove.error) as Error).message}
                </div>
              )}
              <div className="schedule-actions">
                <button
                  className="btn"
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  <Save /> {save.isPending ? "Saving…" : `Save ${selectedDates.length > 1 ? `${selectedDates.length} schedules` : "schedule"}`}
                </button>
                {selectedSchedule && (
                  <button
                    className="btn delete-schedule"
                    disabled={remove.isPending}
                    onClick={() =>
                      window.confirm(
                        `Delete the schedule for ${selected.toLocaleDateString("en-IN")}?`,
                      ) && remove.mutate("MORNING")
                    }
                  >
                    <Trash2 /> Delete
                  </button>
                )}
              </div>
            </>
          )}
          <div className="scheduled-list">
            <h3>Scheduled dates</h3>
            {schedules
              .filter((item: any) => item.scheduleDate)
              .sort((a: any, b: any) =>
                a.scheduleDate.localeCompare(b.scheduleDate),
              )
              .map((item: any) => (
                <button
                  key={item.id}
                  onClick={() => {
                    const date = new Date(
                      `${item.scheduleDate.slice(0, 10)}T00:00:00`,
                    );
                    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                    selectDate(date);
                  }}
                >
                  <b>
                    {sessionOf(item) === "MORNING" ? "Morning · " : "Evening · "}
                    {new Date(item.scheduleDate).toLocaleDateString("en-IN", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </b>
                  <span>
                    {item.startTime}–{item.endTime} · {item.slotMinutes} min ·{" "}
                    {remainingForDate(
                      item.scheduleDate.slice(0, 10),
                      item.maxPatients,
                    )}{" "}
                    slots remaining of {item.maxPatients}
                  </span>
                </button>
              ))}
          </div>
          <div className="doctor-appointments">
            <h3>
              Booked appointments <span>{bookedAppointments.length}</span>
            </h3>
            {bookedAppointments.length ? (
              bookedAppointments.map((item: any) => {
                const patient = patients.find(
                  (entry: any) => entry.id === item.patientId,
                );
                return (
                  <article key={item.id}>
                    <div>
                      <b>{patient?.name || "Patient"}</b>
                      <span>
                        {patient?.mobile || patient?.patientNumber || ""}
                      </span>
                    </div>
                    <div>
                      <strong>
                        {new Date(item.startsAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </strong>
                      <span>
                        {new Date(item.startsAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {item.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  </article>
                );
              })
            ) : (
              <p>No appointments booked for this doctor and branch.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
