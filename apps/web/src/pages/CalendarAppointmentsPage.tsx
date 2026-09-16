import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronRight, Search, Stethoscope, UserX } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, unwrap } from "../api";
import "./CalendarAppointmentsPage.css";

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

const titleCase = (value: string) =>
  String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export function CalendarAppointmentsPage() {
  const { date = "", doctorId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [attendance, setAttendance] = useState("ALL");
  const [payment, setPayment] = useState("ALL");
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const from = validDate ? new Date(`${date}T00:00:00+05:30`) : new Date();
  const to = new Date(from.getTime() + 86400000);
  const queryKey = ["calendar-appointment-day", date];
  const { data: raw = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      api
        .get(`/crm/appointments/calendar?from=${from.toISOString()}&to=${to.toISOString()}`)
        .then(unwrap),
    enabled: validDate,
  });
  const appointments = (raw as any[]).filter((item) => item.status !== "CANCELLED");
  const doctors = useMemo(() => {
    const grouped = new Map<string, any>();
    for (const appointment of appointments) {
      const current = grouped.get(appointment.doctor.id) || {
        ...appointment.doctor,
        department: appointment.department?.name,
        branches: new Set<string>(),
        appointments: [],
      };
      if (appointment.branch?.name) current.branches.add(appointment.branch.name);
      current.appointments.push(appointment);
      grouped.set(appointment.doctor.id, current);
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [appointments]);
  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId);
  const updateAttendance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "CHECKED_IN" | "NO_SHOW" }) =>
      api.patch(`/crm/appointments/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (updateError: any) =>
      window.alert(updateError.response?.data?.message || "Unable to update attendance"),
  });
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (selectedDoctor?.appointments || []).filter((item: any) => {
      const matchesSearch = !text || [item.patient?.name, item.patient?.patientNumber, item.patient?.mobile]
        .some((value) => String(value || "").toLowerCase().includes(text));
      const matchesAttendance =
        attendance === "ALL" ||
        (attendance === "CHECKED_IN" && ["CHECKED_IN", "IN_CONSULTATION", "COMPLETED"].includes(item.status)) ||
        (attendance === "NO_SHOW" && item.status === "NO_SHOW") ||
        (attendance === "WAITING" && !["CHECKED_IN", "NO_SHOW", "COMPLETED"].includes(item.status));
      return matchesSearch && matchesAttendance && (payment === "ALL" || item.paymentStatus === payment);
    });
  }, [selectedDoctor, search, attendance, payment]);

  if (!validDate) return <div className="state error">Invalid calendar date.</div>;
  if (isLoading) return <div className="state">Loading appointments...</div>;
  if (error) return <div className="state error">{(error as any)?.response?.data?.message || "Unable to load appointments"}</div>;

  if (!doctorId) return (
    <div className="calendar-drilldown">
      <button className="schedule-back" onClick={() => navigate("/app/calendar")}><ArrowLeft /> Back to calendar</button>
      <div className="page-head"><div><span>APPOINTMENT ROSTER</span><h1>{dateLabel(date)}</h1><p>{appointments.length} appointment{appointments.length === 1 ? "" : "s"} across {doctors.length} doctor{doctors.length === 1 ? "" : "s"}.</p></div></div>
      {doctors.length ? <div className="doctor-roster-grid">{doctors.map((doctor) => (
        <button key={doctor.id} onClick={() => navigate(`/app/calendar/${date}/${doctor.id}`)}>
          <span className="doctor-roster-icon"><Stethoscope /></span>
          <span><strong>{doctor.name}</strong><small>{doctor.department || "Department not assigned"}</small><em>{[...doctor.branches].join(", ")}</em></span>
          <b>{doctor.appointments.length}<small>patients</small></b><ChevronRight />
        </button>
      ))}</div> : <div className="panel calendar-no-results">No doctor appointments are booked on this date.</div>}
    </div>
  );

  if (!selectedDoctor) return <div className="state error">Doctor appointments were not found for this date.</div>;
  const paymentOptions = [...new Set(selectedDoctor.appointments.map((item: any) => item.paymentStatus))] as string[];
  return (
    <div className="calendar-drilldown">
      <button className="schedule-back" onClick={() => navigate(`/app/calendar/${date}`)}><ArrowLeft /> Back to doctors</button>
      <div className="page-head"><div><span>DAILY PATIENT LIST</span><h1>{selectedDoctor.name}</h1><p>{dateLabel(date)} · {selectedDoctor.department || "Doctor appointments"}</p></div></div>
      <div className="appointment-colour-legend">
        <b>Colour guide:</b><span><i className="waiting" />Awaiting</span><span><i className="checked" />Checked in</span><span><i className="absent" />Absent</span><span><i className="paid" />Paid</span><span><i className="pending" />Payment pending</span><span><i className="partial" />Partially paid</span><span><i className="not-required" />Payment not required</span>
      </div>
      <section className="panel patient-roster">
        <div className="patient-roster-tools">
          <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient name, ID or phone number" /></label>
          <select value={attendance} onChange={(event) => setAttendance(event.target.value)}><option value="ALL">All attendance</option><option value="WAITING">Awaiting</option><option value="CHECKED_IN">Checked in</option><option value="NO_SHOW">Absent</option></select>
          <select value={payment} onChange={(event) => setPayment(event.target.value)}><option value="ALL">All payment statuses</option>{paymentOptions.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select>
        </div>
        <div className="patient-roster-summary">Showing <b>{filtered.length}</b> of {selectedDoctor.appointments.length} patients</div>
        <div className="patient-roster-list">{filtered.map((appointment: any) => {
          const attendanceClass = ["CHECKED_IN", "IN_CONSULTATION", "COMPLETED"].includes(appointment.status) ? "checked" : appointment.status === "NO_SHOW" ? "absent" : "waiting";
          return <article key={appointment.id} className={attendanceClass}>
            <time>{timeLabel(appointment.startsAt)}</time>
            <div className="patient-roster-person"><strong>{appointment.patient?.name || "Patient"}</strong><span>{appointment.patient?.patientNumber || "No patient ID"} · {appointment.patient?.mobile || "No phone number"}</span></div>
            <span className={`attendance-badge ${attendanceClass}`}>{attendanceClass === "checked" ? "Checked in" : attendanceClass === "absent" ? "Absent" : "Awaiting"}</span>
            <span className={`payment-badge ${String(appointment.paymentStatus).toLowerCase()}`}>{titleCase(appointment.paymentStatus)}</span>
            <div className="patient-roster-actions"><button className="checkin" disabled={updateAttendance.isPending || appointment.status === "CHECKED_IN"} onClick={() => updateAttendance.mutate({ id: appointment.id, status: "CHECKED_IN" })}><Check /> Check in</button><button className="absent" disabled={updateAttendance.isPending || appointment.status === "NO_SHOW"} onClick={() => updateAttendance.mutate({ id: appointment.id, status: "NO_SHOW" })}><UserX /> Absent</button></div>
          </article>;
        })}{!filtered.length && <div className="calendar-no-results">No patients match the selected filters.</div>}</div>
      </section>
    </div>
  );
}
