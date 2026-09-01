import { Navigate, Route, Routes } from "react-router-dom";
import { Landing, Pricing, Contact, Features, Legal } from "./pages/Public";
import { Login, Register } from "./pages/Auth";
import { AppLayout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { ResourcePage } from "./pages/Resource";
import { AppointmentBookingPage } from "./pages/AppointmentBookingPage";
const menus = [
  "leads",
  "interested-leads",
  "converted-leads",
  "followups",
  "patients",
  "appointments",
  "calendar",
  "doctors",
  "doctor-schedules",
  "departments",
  "branches",
  "staff",
  "roles-permissions",
  "reports",
  "payments",
  "whatsapp",
  "meta-ads",
  "notifications",
  "support",
  "settings",
  "audit-logs",
];
const admin = [
  "registrations",
  "tenants",
  "plans",
  "features-limits",
  "subscriptions",
  "invoices",
  "transactions",
  "platform-staff",
  "roles-permissions",
  "usage",
  "announcements",
  "integrations",
  "audit-logs",
  "settings",
];
const Protected = ({ children }: { children: React.ReactNode }) =>
  localStorage.getItem("accessToken") ? (
    children
  ) : (
    <Navigate to="/login" replace />
  );
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/features" element={<Features />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/terms" element={<Legal type="Terms" />} />
      <Route path="/privacy" element={<Legal type="Privacy" />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/app"
        element={
          <Protected>
            <AppLayout mode="tenant" />
          </Protected>
        }
      >
        <Route index element={<Dashboard mode="tenant" />} />
        <Route path="appointments/new" element={<AppointmentBookingPage />} />
        {menus.map((x) => (
          <Route
            key={x}
            path={x}
            element={<ResourcePage slug={x} mode="tenant" />}
          />
        ))}
      </Route>
      <Route
        path="/admin"
        element={
          <Protected>
            <AppLayout mode="admin" />
          </Protected>
        }
      >
        <Route index element={<Dashboard mode="admin" />} />
        {admin.map((x) => (
          <Route
            key={x}
            path={x}
            element={<ResourcePage slug={x} mode="admin" />}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
