import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, unwrap } from "../api";
import { AppointmentBookingPage } from "./AppointmentBookingPage";

export function AppointmentEditPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["edit-appointment", id],
    queryFn: () => api.get(`/crm/appointments/${id}`).then(unwrap),
  });
  const appointment = query.data;
  if (query.isLoading) return <div className="state">Loading appointment…</div>;
  if (query.error) return <div className="state error">{(query.error as any).response?.data?.message || "Unable to load appointment."}</div>;
  if (!appointment)
    return <div className="state error">Appointment not found.</div>;
  return <AppointmentBookingPage key={id} appointment={appointment} />;
}
