import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock, Save } from "lucide-react";
import { api, unwrap } from "../api";

const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function DoctorScheduleEditor({ schedule, onBack }: { schedule: any; onBack: () => void }) {
  const qc = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date | null>(null);
  const [form, setForm] = useState({ startTime: schedule.startTime || "09:00", endTime: schedule.endTime || "17:00", slotMinutes: schedule.slotMinutes || 15, maxPatients: schedule.maxPatients || 20, status: schedule.status || "ACTIVE" });
  const { data: schedulesData } = useQuery({ queryKey: ["doctor-schedule-calendar", schedule.doctorId, schedule.branchId], queryFn: () => api.get("/crm/doctorSchedules?limit=100").then(unwrap) });
  const { data: doctorsData } = useQuery({ queryKey: ["schedule-doctors"], queryFn: () => api.get("/crm/doctors?limit=100").then(unwrap) });
  const { data: branchesData } = useQuery({ queryKey: ["schedule-branches"], queryFn: () => api.get("/crm/branches?limit=100").then(unwrap) });
  const schedules = (schedulesData?.items || []).filter((item: any) => item.doctorId === schedule.doctorId && item.branchId === schedule.branchId);
  const doctor = (doctorsData?.items || []).find((item: any) => item.id === schedule.doctorId);
  const branch = (branchesData?.items || []).find((item: any) => item.id === schedule.branchId);
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1), start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [month]);
  const selectDate = (date: Date) => {
    setSelected(date);
    const existing = schedules.find((item: any) => item.dayOfWeek === date.getDay());
    setForm(existing ? { startTime: existing.startTime, endTime: existing.endTime, slotMinutes: existing.slotMinutes, maxPatients: existing.maxPatients, status: existing.status } : { startTime: "09:00", endTime: "17:00", slotMinutes: 15, maxPatients: 20, status: "ACTIVE" });
  };
  const save = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a date first");
      const existing = schedules.find((item: any) => item.dayOfWeek === selected.getDay());
      const body = { doctorId: schedule.doctorId, branchId: schedule.branchId, dayOfWeek: selected.getDay(), ...form, slotMinutes: Number(form.slotMinutes), maxPatients: Number(form.maxPatients) };
      return existing ? api.patch(`/crm/doctorSchedules/${existing.id}`, body) : api.post("/crm/doctorSchedules", body);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["doctor-schedule-calendar"] }); await qc.invalidateQueries({ queryKey: ["/crm/doctorSchedules"] }); window.alert("Schedule saved successfully"); },
  });
  return <div className="schedule-page">
    <button className="schedule-back" onClick={onBack}><ArrowLeft /> Back to schedules</button>
    <div className="schedule-title"><div><span>DOCTOR AVAILABILITY</span><h1>{doctor?.name || "Doctor schedule"}</h1><p>{branch?.name || "Branch"} · Select a date to configure weekly availability.</p></div><CalendarDays /></div>
    <div className="schedule-layout">
      <section className="schedule-calendar panel">
        <div className="calendar-head"><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><h2>{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div>
        <div className="calendar-week">{weekDays.map(day => <b key={day}>{day.slice(0, 3)}</b>)}</div>
        <div className="calendar-days">{cells.map(date => { const active = schedules.some((item: any) => item.dayOfWeek === date.getDay() && item.status === "ACTIVE"), outside = date.getMonth() !== month.getMonth(), chosen = selected && isoDate(selected) === isoDate(date); return <button key={isoDate(date)} className={`${active ? "scheduled" : ""} ${outside ? "outside" : ""} ${chosen ? "selected" : ""}`} onClick={() => selectDate(date)}><span>{date.getDate()}</span>{active && <i>Available</i>}</button>; })}</div>
      </section>
      <aside className="schedule-editor panel">
        <h2>{selected ? selected.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Select a date"}</h2>
        {!selected ? <div className="schedule-empty"><CalendarDays/><p>Click any date in the calendar to view or update its schedule.</p></div> : <>
          <div className="schedule-note">This schedule repeats every <strong>{weekDays[selected.getDay()]}</strong>.</div>
          <label><span><Clock/> Start time</span><input type="time" value={form.startTime} onChange={e => setForm({...form,startTime:e.target.value})}/></label>
          <label><span><Clock/> End time</span><input type="time" value={form.endTime} onChange={e => setForm({...form,endTime:e.target.value})}/></label>
          <div className="schedule-form-row"><label><span>Slot duration</span><select value={form.slotMinutes} onChange={e => setForm({...form,slotMinutes:Number(e.target.value)})}><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><label><span>Maximum patients</span><input type="number" min="1" value={form.maxPatients} onChange={e => setForm({...form,maxPatients:Number(e.target.value)})}/></label></div>
          <label><span>Status</span><select value={form.status} onChange={e => setForm({...form,status:e.target.value})}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
          <div className="slot-summary"><b>Slot summary</b><strong>{form.startTime} – {form.endTime}</strong><span>{form.slotMinutes}-minute slots · Up to {form.maxPatients} patients</span></div>
          {save.error && <div className="alert error">{(save.error as any).response?.data?.message || (save.error as Error).message}</div>}
          <button className="btn full" disabled={save.isPending} onClick={() => save.mutate()}><Save/> {save.isPending ? "Saving…" : "Save schedule"}</button>
        </>}
        <div className="scheduled-list"><h3>Weekly availability</h3>{schedules.sort((a:any,b:any)=>a.dayOfWeek-b.dayOfWeek).map((item:any)=><button key={item.id} onClick={()=>{const date=cells.find(d=>d.getDay()===item.dayOfWeek&&d.getMonth()===month.getMonth());if(date)selectDate(date)}}><b>{weekDays[item.dayOfWeek]}</b><span>{item.startTime}–{item.endTime} · {item.slotMinutes} min · {item.maxPatients} patients</span></button>)}</div>
      </aside>
    </div>
  </div>;
}
