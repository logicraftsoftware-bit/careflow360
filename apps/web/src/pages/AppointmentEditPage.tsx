import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { api, unwrap } from "../api";
import { AppointmentFields } from "./AppointmentFields";

export function AppointmentEditPage() {
  const { id } = useParams(),
    navigate = useNavigate();
  const query = useQuery({
    queryKey: ["edit-appointment", id],
    queryFn: () => api.get("/crm/appointments?limit=100").then(unwrap),
  });
  const appointments = Array.isArray(query.data)
      ? query.data
      : query.data?.items || [],
    appointment = appointments.find((item: any) => item.id === id);
  const save = useMutation({
    mutationFn: (body: any) => api.patch(`/crm/appointments/${id}`, body),
    onSuccess: () => navigate("/app/appointments"),
  });
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      body: any = {};
    for (const key of [
      "patientId",
      "branchId",
      "departmentId",
      "doctorId",
      "startsAt",
      "endsAt",
      "status",
      "paymentStatus",
    ])
      body[key] = data.get(key);
    body.amount = Number(data.get("amount") || 0);
    if (
      ["patientId", "branchId", "departmentId", "doctorId", "startsAt"].some(
        (key) => !body[key],
      )
    )
      return window.alert("Please complete all appointment fields.");
    save.mutate(body);
  };
  if (query.isLoading) return <div className="state">Loading appointment…</div>;
  if (!appointment)
    return <div className="state error">Appointment not found.</div>;
  return (
    <div className="booking-page">
      <button
        className="schedule-back"
        onClick={() => navigate("/app/appointments")}
      >
        <ArrowLeft /> Back to appointments
      </button>
      <div className="booking-head">
        <div>
          <span>EDIT APPOINTMENT</span>
          <h1>Edit appointment</h1>
          <p>
            Update the patient, doctor slot, booking status, or payment status.
          </p>
        </div>
        <CalendarCheck />
      </div>
      <form onSubmit={submit} className="booking-layout edit-booking-layout">
        <section className="panel booking-form">
          <h2>Appointment information</h2>
          <AppointmentFields appointment={appointment} />
          {save.error && (
            <div className="alert error">
              {(save.error as any).response?.data?.message ||
                "Unable to update appointment"}
            </div>
          )}
          <div className="booking-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate("/app/appointments")}
            >
              Cancel
            </button>
            <button className="btn" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </section>
        <aside>
          <section className="panel edit-summary">
            <h2>Appointment details</h2>
            <p>
              <b>Token</b>
              <br />
              {appointment.token || "Not generated"}
            </p>
            <p>
              <b>Appointment number</b>
              <br />
              {appointment.appointmentNumber}
            </p>
          </section>
        </aside>
      </form>
    </div>
  );
}
