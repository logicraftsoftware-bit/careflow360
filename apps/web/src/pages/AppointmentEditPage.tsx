import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, unwrap } from "../api";
import { AppointmentBookingPage } from "./AppointmentBookingPage";

export function AppointmentEditPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["edit-appointment", id],
    queryFn: () => api.get("/crm/appointments?limit=100").then(unwrap),
  });
  const appointments = Array.isArray(query.data)
      ? query.data
      : query.data?.items || [],
    appointment = appointments.find((item: any) => item.id === id);
  if (query.isLoading) return <div className="state">Loading appointment…</div>;
  if (!appointment)
    return <div className="state error">Appointment not found.</div>;
  return <AppointmentBookingPage appointment={appointment} />;
}
