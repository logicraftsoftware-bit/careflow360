import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Database,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  PhoneCall,
  ScanLine,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { api, unwrap } from "../api";
const tenant = [
  ["Dashboard", "", LayoutDashboard],
  ["Leads", "leads", ClipboardList],
  ["Patients", "patients", Users],
  ["Appointments", "appointments", CalendarDays],
  ["Calendar", "calendar", CalendarDays],
  ["Reports", "reports", FileText],
  ["Payments", "payments", WalletCards],
  ["IVR Call Logs", "call-logs", PhoneCall],
  ["WhatsApp", "whatsapp", MessageCircle],
  ["Audit Logs", "audit-logs", FileText],
] as const;
const leads = [
  ["Meta Ads", "meta-ads", Activity],
  ["Leads", "leads", ClipboardList],
  ["Interested Leads", "interested-leads", HeartPulse],
  ["Converted Leads", "converted-leads", Users],
] as const;
const appointments = [
  ["Doctor Appointments", "appointments", Stethoscope],
  ["Lab Appointments", "lab-appointments", FlaskConical],
  ["Radiology Appointments", "radiology-appointments", ScanLine],
] as const;
const collections = [
  ["Assigned", "lab-collection/assigned", ClipboardList],
  ["Collected Samples", "lab-collection/collected", CheckCircle2],
  ["All Technician Data", "lab-collection/all", Users],
] as const;
const masters = [
  ["Settings", "settings", Settings],
  ["Department", "departments", Building2],
  ["Branches", "branches", Building2],
  ["Doctors", "doctors", Stethoscope],
  ["Doctor Schedule", "doctor-schedules", CalendarDays],
  ["Staff", "staff", Users],
  ["Roles & Permission", "roles-permissions", ShieldCheck],
  ["Lab", "lab", FlaskConical],
  ["Radiology", "radiology", ScanLine],
] as const;
const admin = [
  ["Dashboard", "", LayoutDashboard],
  ["Registrations", "registrations", ClipboardList],
  ["Tenants / Clinics", "tenants", Building2],
  ["Plans", "plans", WalletCards],
  ["Features & Limits", "features-limits", Settings],
  ["Subscriptions", "subscriptions", Activity],
  ["SaaS Invoices", "invoices", FileText],
  ["Transactions", "transactions", WalletCards],
  ["Platform Staff", "platform-staff", Users],
  ["Roles & Permissions", "roles-permissions", ShieldCheck],
  ["Usage", "usage", Activity],
  ["Announcements", "announcements", MessageCircle],
  ["AiSensy", "integrations", MessageCircle],
  ["Razorpay", "razorpay", WalletCards],
  ["Exotel", "exotel", PhoneCall],
  ["Audit Logs", "audit-logs", FileText],
  ["Platform Settings", "settings", Settings],
] as const;
export function AppLayout({ mode }: { mode: "tenant" | "admin" }) {
  const location = useLocation(),
    navigate = useNavigate(),
    embedded = new URLSearchParams(location.search).get("embedded") === "1",
    user = JSON.parse(localStorage.getItem("user") || "{}"),
    staff = mode === "tenant" && user.portal === "STAFF",
    permissions = new Set<string>(user.permissions || []),
    key = (path: string) =>
      path === ""
        ? "dashboard"
        : path === "appointments"
        ? "doctor-appointments"
        : path,
    canRead = (path: string) =>
      !staff ||
      (path === "lab-collection" &&
        user.roleCodes?.includes("LAB_TECHNICIAN")) ||
      permissions.has(`${key(path)}.read`) ||
      permissions.has(`${key(path)}.manage`);
  const leadItems = leads.filter(([, path]) => canRead(path)),
    appointmentItems = appointments.filter(([, path]) => canRead(path)),
    masterItems = masters.filter(([, path]) => canRead(path)),
    collectionItems = staff
      ? collections.filter(([, path]) => !path.endsWith("/all"))
      : collections,
    leadActive = leads.some(([, path]) =>
      location.pathname.startsWith(`/app/${path}`)
    ),
    appointmentActive = appointments.some(([, path]) =>
      location.pathname.startsWith(`/app/${path}`)
    ),
    collectionActive = location.pathname.startsWith("/app/lab-collection"),
    masterActive = masters.some(([, path]) =>
      location.pathname.startsWith(`/app/${path}`)
    );
  const [open, setOpen] = useState(false),
    [leadOpen, setLeadOpen] = useState(leadActive),
    [appointmentOpen, setAppointmentOpen] = useState(appointmentActive),
    [collectionOpen, setCollectionOpen] = useState(collectionActive),
    [masterOpen, setMasterOpen] = useState(masterActive);
  useEffect(() => {
    if (leadActive) setLeadOpen(true);
    if (appointmentActive) setAppointmentOpen(true);
    if (collectionActive) setCollectionOpen(true);
    if (masterActive) setMasterOpen(true);
  }, [leadActive, appointmentActive, collectionActive, masterActive]);
  const { data: clinic } = useQuery({
      queryKey: ["clinic-profile"],
      queryFn: () => api.get("/crm/clinic-profile").then(unwrap),
      enabled: mode === "tenant",
    }),
    brand = mode === "tenant" ? clinic?.name || "My Clinic" : "CareFlow360",
    logo = mode === "tenant" && clinic?.logoUrl ? clinic.logoUrl : "/logo.png";
  const group = (
    title: string,
    Icon: any,
    active: boolean,
    expanded: boolean,
    toggle: () => void,
    items: readonly (readonly [string, string, any])[]
  ) => (
    <div className={`nav-group${active ? " active" : ""}`}>
      <button type="button" className="nav-group-toggle" onClick={toggle}>
        <Icon size={18} />
        <span>{title}</span>
        <ChevronDown className={expanded ? "expanded" : ""} size={16} />
      </button>
      {expanded && (
        <div className="nav-submenu">
          {items.map(([label, path, ItemIcon]) => (
            <NavLink to={path} key={path} onClick={() => setOpen(false)}>
              <ItemIcon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="shell" style={embedded ? { display: "block" } : undefined}>
      {!embedded && (
        <aside className={open ? "sidebar open" : "sidebar"}>
          <div className="brand">
            <img src={logo} />
            <span>{brand}</span>
            <button className="icon mobile" onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>
          <div className="workspace">
            <small>
              {mode === "admin"
                ? "PLATFORM CONSOLE"
                : staff
                ? "STAFF WORKSPACE"
                : "CLINIC WORKSPACE"}
            </small>
            <strong>{brand}</strong>
            {mode === "tenant" && clinic?.mobile && (
              <small>{clinic.mobile}</small>
            )}
          </div>
          <nav>
            {mode === "tenant"
              ? tenant.map(([label, path, Icon]) =>
                  path === "leads" ? (
                    leadItems.length ? (
                      group(
                        "Leads",
                        ClipboardList,
                        leadActive,
                        leadOpen,
                        () => setLeadOpen((v) => !v),
                        leadItems
                      )
                    ) : null
                  ) : path === "appointments" ? (
                    appointmentItems.length ? (
                      group(
                        "Appointments",
                        CalendarDays,
                        appointmentActive,
                        appointmentOpen,
                        () => setAppointmentOpen((v) => !v),
                        appointmentItems
                      )
                    ) : null
                  ) : canRead(path) ? (
                    <NavLink
                      end={!path}
                      to={path}
                      key={path}
                      onClick={() => setOpen(false)}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </NavLink>
                  ) : null
                )
              : admin.map(([label, path, Icon]) => (
                  <NavLink
                    end={!path}
                    to={path}
                    key={path}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </NavLink>
                ))}
            {mode === "tenant" &&
              canRead("lab-collection") &&
              group(
                "Lab Collection",
                FlaskConical,
                collectionActive,
                collectionOpen,
                () => setCollectionOpen((v) => !v),
                collectionItems
              )}
            {mode === "tenant" &&
              masterItems.length > 0 &&
              group(
                "Master Data",
                Database,
                masterActive,
                masterOpen,
                () => setMasterOpen((v) => !v),
                masterItems
              )}
          </nav>
        </aside>
      )}
      <main>
        {!embedded && (
          <header className="topbar">
            <button className="icon" onClick={() => setOpen(true)}>
              <Menu />
            </button>
            <div className="top-search">
              Search patients, leads, appointments…
            </div>
            <div className="avatar">{(user.name || "A")[0]}</div>
            <div className="user">
              <strong>{user.name || "Administrator"}</strong>
              <small>
                {mode === "admin"
                  ? "Super Admin"
                  : staff
                  ? (user.roleCodes?.[0] || "Staff").replaceAll("_", " ")
                  : brand}
              </small>
            </div>
            <button
              className="icon"
              title="Log out"
              onClick={() => {
                localStorage.clear();
                navigate("/login");
              }}
            >
              <LogOut />
            </button>
          </header>
        )}
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
