import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Check, ChevronDown, Search } from "lucide-react";
import { api, unwrap } from "../api";

export type Option = { id: string; label: string; search: string; raw: any };
export function SearchSelect({
  name,
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  name: string;
  label: string;
  options: Option[];
  value: string;
  onChange: (id: string, raw?: any) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);
  const matches = options
    .filter(
      (option) =>
        !query || option.search.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 12);
  return (
    <label>
      {label}
      <div className="smart-select">
        <input type="hidden" name={name} value={value} />
        <div className="smart-select-input">
          <Search />
          <input
            disabled={disabled}
            value={open ? query : selected?.label || ""}
            placeholder={placeholder}
            onFocus={() => {
              setQuery("");
              setOpen(true);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
          />
          <ChevronDown />
        </div>
        {open && !disabled && (
          <div className="smart-options">
            {matches.length ? (
              matches.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  onMouseDown={() => {
                    onChange(option.id, option.raw);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span>{option.label}</span>
                  {option.id === value && <Check />}
                </button>
              ))
            ) : (
              <p>No matching records</p>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

const rows = (data: any) => (Array.isArray(data) ? data : data?.items || []);
const dateKey = (value: string | Date) =>
  new Date(value).toISOString().slice(0, 10);
export function AppointmentFields({ appointment }: { appointment?: any }) {
  const endpoints = [
    "patients",
    "branches",
    "departments",
    "doctors",
    "doctorSchedules",
    "appointments",
  ];
  const queries = useQueries({
    queries: endpoints.map((endpoint) => ({
      queryKey: ["appointment-form", endpoint],
      queryFn: () => api.get(`/crm/${endpoint}?limit=100`).then(unwrap),
    })),
  });
  const [patientId, setPatientId] = useState(appointment?.patientId || ""),
    [branchId, setBranchId] = useState(appointment?.branchId || ""),
    [departmentId, setDepartmentId] = useState(appointment?.departmentId || ""),
    [doctorId, setDoctorId] = useState(appointment?.doctorId || ""),
    [startsAt, setStartsAt] = useState(appointment?.startsAt || ""),
    [endsAt, setEndsAt] = useState(appointment?.endsAt || ""),
    [amount, setAmount] = useState(Number(appointment?.amount || 0));
  const patients = rows(queries[0].data),
    branches = rows(queries[1].data),
    departments = rows(queries[2].data),
    doctors = rows(queries[3].data),
    schedules = rows(queries[4].data),
    appointments = rows(queries[5].data);
  useEffect(() => {
    const doctor = doctors.find((item: any) => item.id === doctorId);
    if (doctor) setAmount(Number(doctor.consultationFee || 0));
  }, [doctorId, queries[3].data]);
  const patientOptions = patients.map((patient: any) => ({
    id: patient.id,
    label: `${patient.name} · ${patient.mobile || "No phone"} · ${patient.patientNumber}`,
    search: `${patient.name} ${patient.mobile} ${patient.patientNumber} ${patient.id}`,
    raw: patient,
  }));
  const branchOptions = branches.map((branch: any) => ({
    id: branch.id,
    label: `${branch.name} · ${branch.city || ""}`,
    search: `${branch.name} ${branch.city} ${branch.id}`,
    raw: branch,
  }));
  const departmentOptions = departments.map((department: any) => ({
    id: department.id,
    label: `${department.name} · ${department.code}`,
    search: `${department.name} ${department.code} ${department.id}`,
    raw: department,
  }));
  const scheduledDoctorIds = new Set(
    schedules
      .filter((schedule: any) => !branchId || schedule.branchId === branchId)
      .map((schedule: any) => schedule.doctorId),
  );
  const doctorOptions = doctors
    .filter(
      (doctor: any) =>
        (!departmentId || doctor.departmentId === departmentId) &&
        (!branchId || scheduledDoctorIds.has(doctor.id)),
    )
    .map((doctor: any) => ({
      id: doctor.id,
      label: `${doctor.name} · ${doctor.specialization || "General"} · ₹${doctor.consultationFee || 0}`,
      search: `${doctor.name} ${doctor.specialization} ${doctor.registrationNumber} ${doctor.mobile} ${doctor.id}`,
      raw: doctor,
    }));
  const slotOptions = useMemo(() => {
    if (!doctorId || !branchId) return [];
    const booked = new Set(
      appointments
        .filter(
          (item: any) =>
            item.id !== appointment?.id &&
            item.doctorId === doctorId &&
            item.branchId === branchId &&
            item.status !== "CANCELLED",
        )
        .map((item: any) => new Date(item.startsAt).toISOString().slice(0, 16)),
    );
    const now = new Date();
    return schedules
      .filter(
        (schedule: any) =>
          schedule.doctorId === doctorId &&
          schedule.branchId === branchId &&
          schedule.status === "ACTIVE" &&
          schedule.scheduleDate,
      )
      .flatMap((schedule: any) => {
        const [startHour, startMinute] = schedule.startTime
            .split(":")
            .map(Number),
          [endHour, endMinute] = schedule.endTime.split(":").map(Number),
          day = dateKey(schedule.scheduleDate),
          start = new Date(
            `${day}T${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00`,
          ),
          end = new Date(
            `${day}T${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}:00`,
          ),
          result: Option[] = [];
        for (
          let cursor = new Date(start), count = 0;
          cursor < end && count < schedule.maxPatients;
          cursor = new Date(cursor.getTime() + schedule.slotMinutes * 60000),
            count++
        ) {
          const id = cursor.toISOString();
          if (
            (cursor > now || id === appointment?.startsAt) &&
            !booked.has(id.slice(0, 16))
          )
            result.push({
              id,
              label: `${cursor.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${cursor.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
              search: `${day} ${cursor.toLocaleDateString()} ${cursor.toLocaleTimeString()}`,
              raw: schedule,
            });
        }
        return result;
      })
      .sort((a: Option, b: Option) => a.id.localeCompare(b.id));
  }, [schedules, appointments, doctorId, branchId, appointment?.id]);
  return (
    <div className="modal-grid appointment-grid">
      <SearchSelect
        name="patientId"
        label="Patient"
        options={patientOptions}
        value={patientId}
        onChange={setPatientId}
        placeholder="Search name, phone or patient ID"
      />
      <SearchSelect
        name="branchId"
        label="Branch"
        options={branchOptions}
        value={branchId}
        onChange={(id) => {
          setBranchId(id);
          setDoctorId("");
          setStartsAt("");
        }}
        placeholder="Search branch name or city"
      />
      <SearchSelect
        name="departmentId"
        label="Department"
        options={departmentOptions}
        value={departmentId}
        onChange={(id) => {
          setDepartmentId(id);
          setDoctorId("");
          setStartsAt("");
        }}
        placeholder="Search department name or code"
      />
      <SearchSelect
        name="doctorId"
        label="Doctor"
        options={doctorOptions}
        value={doctorId}
        onChange={(id, doctor) => {
          setDoctorId(id);
          setAmount(Number(doctor?.consultationFee || 0));
          setStartsAt("");
        }}
        placeholder={
          branchId ? "Search doctor name or speciality" : "Select branch first"
        }
        disabled={!branchId}
      />
      <div className="wide">
        <SearchSelect
          name="startsAt"
          label="Available appointment slot"
          options={slotOptions}
          value={startsAt}
          onChange={(id, schedule) => {
            setStartsAt(id);
            setEndsAt(
              new Date(
                new Date(id).getTime() +
                  Number(schedule?.slotMinutes || 30) * 60000,
              ).toISOString(),
            );
          }}
          placeholder={
            doctorId
              ? "Search and select available date/time slot"
              : "Select doctor first"
          }
          disabled={!doctorId}
        />
        <input type="hidden" name="endsAt" value={endsAt} />
        {doctorId && !slotOptions.length && (
          <div className="alert error">
            No future slots are configured for this doctor and branch.
          </div>
        )}
      </div>
      <label>
        Consultation fee
        <input
          name="amount"
          type="number"
          value={amount}
          readOnly
          className="fee-readonly"
        />
      </label>
      <label>
        Status
        <select name="status" defaultValue={appointment?.status || "DRAFT"}>
          <option value="DRAFT">Draft</option>
          <option value="BOOKING_PENDING">Booking pending</option>
          <option value="PAYMENT_PENDING">Payment pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CHECKED_IN">Checked in</option>
          <option value="IN_CONSULTATION">In consultation</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="NO_SHOW">No show</option>
          <option value="RESCHEDULED">Rescheduled</option>
        </select>
      </label>
      <label>
        Payment status
        <select
          name="paymentStatus"
          defaultValue={appointment?.paymentStatus || "NOT_REQUIRED"}
        >
          <option value="NOT_REQUIRED">Not required</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="PARTIALLY_PAID">Partially paid</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </label>
    </div>
  );
}
