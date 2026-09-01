import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock, Save, Trash2 } from "lucide-react";
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
  const { data: appointmentsData } = useQuery({ queryKey: ["schedule-appointments", schedule.doctorId, schedule.branchId], queryFn: () => api.get("/crm/appointments?limit=100").then(unwrap) });
  const { data: patientsData } = useQuery({ queryKey: ["schedule-patients"], queryFn: () => api.get("/crm/patients?limit=100").then(unwrap) });
  const schedules = (schedulesData?.items || []).filter((item: any) => item.doctorId === schedule.doctorId && item.branchId === schedule.branchId);
  const doctor = (doctorsData?.items || []).find((item: any) => item.id === schedule.doctorId);
  const branch = (branchesData?.items || []).find((item: any) => item.id === schedule.branchId);
  const patients = patientsData?.items || [];
  const bookedAppointments = (appointmentsData?.items || []).filter((item: any) => item.doctorId === schedule.doctorId && item.branchId === schedule.branchId).sort((a: any, b: any) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1), start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  }, [month]);
  const selectDate = (date: Date) => {
    setSelected(date);
    const existing = schedules.find((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(date));
    setForm(existing ? { startTime: existing.startTime, endTime: existing.endTime, slotMinutes: existing.slotMinutes, maxPatients: existing.maxPatients, status: existing.status } : { startTime: "09:00", endTime: "17:00", slotMinutes: 15, maxPatients: 20, status: "ACTIVE" });
  };
  const save = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a date first");
      const existing = schedules.find((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(selected));
      const body = { doctorId: schedule.doctorId, branchId: schedule.branchId, dayOfWeek: selected.getDay(), scheduleDate: isoDate(selected), ...form, slotMinutes: Number(form.slotMinutes), maxPatients: Number(form.maxPatients) };
      return existing ? api.patch(`/crm/doctorSchedules/${existing.id}`, body) : api.post("/crm/doctorSchedules", body);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["doctor-schedule-calendar"] }); await qc.invalidateQueries({ queryKey: ["/crm/doctorSchedules"] }); window.alert("Schedule saved successfully"); },
  });
  const remove = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select a scheduled date first");
      const existing = schedules.find((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(selected));
      if (!existing) throw new Error("No schedule exists for this date");
      return api.delete(`/crm/doctorSchedules/${existing.id}`);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["doctor-schedule-calendar"] }); await qc.invalidateQueries({ queryKey: ["/crm/doctorSchedules"] }); setSelected(null); window.alert("Schedule deleted successfully"); },
  });
  const selectedSchedule = selected ? schedules.find((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(selected)) : null;
  return <div className="schedule-page">
    <button className="schedule-back" onClick={onBack}><ArrowLeft /> Back to schedules</button>
    <div className="schedule-title"><div><span>DOCTOR AVAILABILITY</span><h1>{doctor?.name || "Doctor schedule"}</h1><p>{branch?.name || "Branch"} · Configure availability separately for each calendar date.</p></div><CalendarDays /></div>
    <div className="schedule-layout">
      <section className="schedule-calendar panel">
        <div className="calendar-head"><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><h2>{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div>
        <div className="calendar-week">{weekDays.map(day => <b key={day}>{day.slice(0, 3)}</b>)}</div>
        <div className="calendar-days">{cells.map(date => { const dateSchedule = schedules.find((item: any) => item.scheduleDate?.slice(0, 10) === isoDate(date) && item.status === "ACTIVE"), active = !!dateSchedule, outside = date.getMonth() !== month.getMonth(), chosen = selected && isoDate(selected) === isoDate(date); return <button key={isoDate(date)} className={`${active ? "scheduled" : ""} ${outside ? "outside" : ""} ${chosen ? "selected" : ""}`} onClick={() => selectDate(date)}><span>{date.getDate()}</span>{active && <i>Available <em>{dateSchedule.maxPatients} slots</em></i>}</button>; })}</div>
      </section>
      <aside className="schedule-editor panel">
        <h2>{selected ? selected.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Select a date"}</h2>
        {!selected ? <div className="schedule-empty"><CalendarDays/><p>Click any date in the calendar to view or update its schedule.</p></div> : <>
          <div className="schedule-note">This availability applies only to <strong>{selected.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</strong>.</div>
          <label><span><Clock/> Start time</span><input type="time" value={form.startTime} onChange={e => setForm({...form,startTime:e.target.value})}/></label>
          <label><span><Clock/> End time</span><input type="time" value={form.endTime} onChange={e => setForm({...form,endTime:e.target.value})}/></label>
          <div className="schedule-form-row"><label><span>Slot duration</span><select value={form.slotMinutes} onChange={e => setForm({...form,slotMinutes:Number(e.target.value)})}><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label><label><span>Maximum patients</span><input type="number" min="1" value={form.maxPatients} onChange={e => setForm({...form,maxPatients:Number(e.target.value)})}/></label></div>
          <label><span>Status</span><select value={form.status} onChange={e => setForm({...form,status:e.target.value})}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
          <div className="slot-summary"><b>Slot summary</b><strong>{form.startTime} – {form.endTime}</strong><span>{form.slotMinutes}-minute slots · Up to {form.maxPatients} patients</span></div>
          {(save.error || remove.error) && <div className="alert error">{((save.error || remove.error) as any).response?.data?.message || ((save.error || remove.error) as Error).message}</div>}
          <div className="schedule-actions"><button className="btn" disabled={save.isPending} onClick={() => save.mutate()}><Save/> {save.isPending ? "Saving…" : "Save schedule"}</button>{selectedSchedule && <button className="btn delete-schedule" disabled={remove.isPending} onClick={() => window.confirm(`Delete the schedule for ${selected.toLocaleDateString("en-IN")}?`) && remove.mutate()}><Trash2/> Delete</button>}</div>
        </>}
        <div className="scheduled-list"><h3>Scheduled dates</h3>{schedules.filter((item:any)=>item.scheduleDate).sort((a:any,b:any)=>a.scheduleDate.localeCompare(b.scheduleDate)).map((item:any)=><button key={item.id} onClick={()=>{const date=new Date(`${item.scheduleDate.slice(0,10)}T00:00:00`);setMonth(new Date(date.getFullYear(),date.getMonth(),1));selectDate(date)}}><b>{new Date(item.scheduleDate).toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</b><span>{item.startTime}–{item.endTime} · {item.slotMinutes} min · {item.maxPatients} patients</span></button>)}</div>
        <div className="doctor-appointments"><h3>Booked appointments <span>{bookedAppointments.length}</span></h3>{bookedAppointments.length ? bookedAppointments.map((item:any)=>{const patient=patients.find((entry:any)=>entry.id===item.patientId);return <article key={item.id}><div><b>{patient?.name||"Patient"}</b><span>{patient?.mobile||patient?.patientNumber||""}</span></div><div><strong>{new Date(item.startsAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</strong><span>{new Date(item.startsAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} · {item.status.replaceAll("_"," ")}</span></div></article>}) : <p>No appointments booked for this doctor and branch.</p>}</div>
      </aside>
    </div>
  </div>;
}
