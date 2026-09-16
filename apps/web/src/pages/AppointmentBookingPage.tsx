import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  Clock,
  Plus,
  Search,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, unwrap } from "../api";
import "./AppointmentBookingPage.css";

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
const displayDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
type SessionPeriod = "MORNING" | "EVENING";

export function AppointmentBookingPage({
  appointment: _appointment,
}: { appointment?: any } = {}) {
  const navigate = useNavigate(),
    today = new Date(),
    todayKey = dateKey(today);
  const [month, setMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState(""),
    [branchId, setBranchId] = useState(""),
    [departmentId, setDepartmentId] = useState("");
  const [sessionPeriod, setSessionPeriod] = useState<SessionPeriod | "">(""),
    [doctorId, setDoctorId] = useState(""),
    [scheduleId, setScheduleId] = useState("");
  const [patientMode, setPatientMode] = useState<"EXISTING" | "NEW">(
      "EXISTING"
    ),
    [patientSearch, setPatientSearch] = useState(""),
    [patient, setPatient] = useState<any>(null),
    [showNewPatient, setShowNewPatient] = useState(false);
  const [appointmentTime, setAppointmentTime] = useState(""),
    [status, setStatus] = useState("CONFIRMED"),
    [paymentStatus, setPaymentStatus] = useState("PENDING");
  const [paymentMethod, setPaymentMethod] = useState(""),
    [utrNumber, setUtrNumber] = useState(""),
    [paymentRemarks, setPaymentRemarks] = useState("");

  const {
    data: optionData = { schedules: [], appointments: [] },
    isFetching: optionsLoading,
    error: optionsError,
  } = useQuery({
    queryKey: ["doctor-appointment-options", selectedDate],
    queryFn: () =>
      api
        .get("/crm/doctor-appointment-options", {
          params: { date: selectedDate },
        })
        .then(unwrap),
    enabled: Boolean(selectedDate),
  });
  const {
    data: patientData = { items: [] },
    isFetching: patientsLoading,
    refetch: refetchPatients,
  } = useQuery({
    queryKey: ["appointment-patients", patientSearch],
    queryFn: () =>
      api
        .get("/crm/appointment-patients", { params: { search: patientSearch } })
        .then(unwrap),
    enabled: Boolean(doctorId && !patient && patientMode === "EXISTING" && patientSearch.trim()),
  });
  const schedules: any[] = optionData.schedules || [],
    appointments: any[] = optionData.appointments || [];
  const branches = useMemo(
    () => [
      ...new Map(
        schedules.map((item) => [item.branchId, item.branch])
      ).values(),
    ],
    [schedules]
  );
  const departments = useMemo(
    () =>
      [
        ...new Map(
          schedules
            .filter((item) => item.branchId === branchId)
            .map((item) => [item.doctor.departmentId, item.doctor.department])
        ).values(),
      ].filter(Boolean),
    [schedules, branchId]
  );
  const sessions = useMemo(
    () =>
      [
        ...new Set(
          schedules
            .filter(
              (item) =>
                item.branchId === branchId &&
                item.doctor.departmentId === departmentId
            )
            .map((item) =>
              item.sessionPeriod === "EVENING" ? "EVENING" : "MORNING"
            )
        ),
      ] as SessionPeriod[],
    [schedules, branchId, departmentId]
  );
  const doctorSchedules = schedules.filter(
    (item) =>
      item.branchId === branchId &&
      item.doctor.departmentId === departmentId &&
      (item.sessionPeriod === "EVENING" ? "EVENING" : "MORNING") ===
        sessionPeriod
  );
  const selectedSchedule = schedules.find((item) => item.id === scheduleId),
    selectedDoctor = selectedSchedule?.doctor;
  const timeOptions = selectedSchedule
    ? Array.from({ length: selectedSchedule.maxPatients }, (_, index) => {
        const start = new Date(
          new Date(
            `${selectedDate}T${selectedSchedule.startTime}:00+05:30`
          ).getTime() +
            index * selectedSchedule.slotMinutes * 60000
        );
        return {
          value: start.toISOString(),
          label: start.toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      }).filter(
        (slot) =>
          !appointments.some(
            (item) =>
              item.doctorId === doctorId &&
              item.branchId === branchId &&
              new Date(item.startsAt).getTime() ===
                new Date(slot.value).getTime()
          )
      )
    : [];
  const calendarCells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1),
      start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);
  const resetAfterDate = () => {
    setBranchId("");
    setDepartmentId("");
    setSessionPeriod("");
    setDoctorId("");
    setScheduleId("");
    setPatient(null);
    setAppointmentTime("");
  };
  const resetAfterBranch = () => {
    setDepartmentId("");
    setSessionPeriod("");
    setDoctorId("");
    setScheduleId("");
    setPatient(null);
    setAppointmentTime("");
  };
  const resetAfterDepartment = () => {
    setSessionPeriod("");
    setDoctorId("");
    setScheduleId("");
    setPatient(null);
    setAppointmentTime("");
  };
  const resetAfterSession = () => {
    setDoctorId("");
    setScheduleId("");
    setPatient(null);
    setAppointmentTime("");
  };
  const step = !selectedDate
    ? 1
    : !branchId
    ? 2
    : !departmentId
    ? 3
    : !sessionPeriod
    ? 4
    : !doctorId
    ? 5
    : !patient
    ? 6
    : 7;
  const createPatient = useMutation({
    mutationFn: (body: any) => api.post("/crm/patients", body).then(unwrap),
    onSuccess: async (saved: any) => {
      setPatient(saved);
      setShowNewPatient(false);
      await refetchPatients();
    },
  });
  const book = useMutation({
    mutationFn: () =>
      api.post("/crm/appointments/book", {
        patientId: patient.id,
        branchId,
        departmentId,
        doctorId,
        scheduleId,
        startsAt: appointmentTime,
        status,
        paymentStatus,
        paymentMethod: paymentStatus === "PAID" ? paymentMethod : undefined,
        utrNumber: paymentStatus === "PAID" ? utrNumber : undefined,
        paymentRemarks: paymentStatus === "PAID" ? paymentRemarks : undefined,
      }),
    onSuccess: (response: any) => {
      const saved = response.data.data;
      window.alert(
        saved.token
          ? `Appointment booked successfully\nToken: ${saved.token}`
          : "Appointment slot held pending payment"
      );
      navigate("/app/appointments");
    },
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!appointmentTime)
      return window.alert("Please select an available appointment time");
    if (paymentStatus === "PAID" && !paymentMethod)
      return window.alert("Please select a payment method");
    if (
      paymentStatus === "PAID" &&
      paymentMethod !== "CASH" &&
      !utrNumber.trim()
    )
      return window.alert("Please enter the transaction number");
    book.mutate();
  };
  const stepLabels = [
    "Date",
    "Branch",
    "Department",
    "Session",
    "Doctor",
    "Patient",
    "Confirm",
  ];

  return (
    <div className="booking-wizard">
      <button
        className="schedule-back"
        onClick={() => navigate("/app/appointments")}
      >
        <ArrowLeft /> Back to appointments
      </button>
      <div className="booking-head">
        <div>
          <span>NEW APPOINTMENT</span>
          <h1>Book doctor appointment</h1>
          <p>Complete each step to find the right doctor and available time.</p>
        </div>
        <CalendarCheck />
      </div>
      <nav className="wizard-progress">
        {stepLabels.map((label, index) => (
          <div
            key={label}
            className={
              step > index + 1 ? "done" : step === index + 1 ? "active" : ""
            }
          >
            <i>{step > index + 1 ? <Check /> : index + 1}</i>
            <span>{label}</span>
          </div>
        ))}
      </nav>
      <section className="panel wizard-card" key={step}>
        {step === 1 && (
          <>
            <WizardTitle
              number={1}
              title="Choose appointment date"
              subtitle="Select the date when the patient wants to visit."
            />
            <div className="wizard-calendar">
              <header>
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1)
                    )
                  }
                >
                  <ArrowLeft />
                </button>
                <b>
                  {month.toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric",
                  })}
                </b>
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1)
                    )
                  }
                >
                  <ArrowRight />
                </button>
              </header>
              <div className="weekdays">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <span key={day}>{day}</span>
                  )
                )}
              </div>
              <div className="days">
                {calendarCells.map((date) => {
                  const key = dateKey(date),
                    disabled = key < todayKey,
                    outside = date.getMonth() !== month.getMonth();
                  return (
                    <button
                      key={key}
                      disabled={disabled}
                      className={`${outside ? "outside" : ""} ${
                        selectedDate === key ? "selected" : ""
                      }`}
                      onClick={() => {
                        setSelectedDate(key);
                        resetAfterDate();
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {step === 2 && (
          <ChoiceStep
            number={2}
            title="Select branch"
            subtitle={`${displayDate(
              selectedDate
            )} · Choose the clinic branch.`}
            onBack={() => setSelectedDate("")}
          >
            {optionsError ? (
              <Empty text={(optionsError as any).response?.data?.message || "Unable to load doctor schedules. Please try again."} />
            ) : optionsLoading ? (
              <Loading />
            ) : branches.length ? (
              <div className="choice-grid">
                {branches.map((branch: any) => (
                  <Choice
                    key={branch.id}
                    title={branch.name}
                    subtitle={[branch.city, branch.address]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() => {
                      setBranchId(branch.id);
                      resetAfterBranch();
                    }}
                  />
                ))}
              </div>
            ) : (
              <Empty text="No doctor schedules are available on this date." />
            )}
          </ChoiceStep>
        )}
        {step === 3 && (
          <ChoiceStep
            number={3}
            title="Select department"
            subtitle="Only departments with available doctors are shown."
            onBack={() => setBranchId("")}
          >
            <div className="choice-grid">
              {departments.map((department: any) => (
                <Choice
                  key={department.id}
                  title={department.name}
                  subtitle={department.code}
                  onClick={() => {
                    setDepartmentId(department.id);
                    resetAfterDepartment();
                  }}
                />
              ))}
            </div>
          </ChoiceStep>
        )}
        {step === 4 && (
          <ChoiceStep
            number={4}
            title="Morning or evening?"
            subtitle="Choose the preferred consultation session."
            onBack={() => setDepartmentId("")}
          >
            <div className="session-choice">
              {sessions.map((period) => (
                <button
                  key={period}
                  onClick={() => {
                    setSessionPeriod(period);
                    resetAfterSession();
                  }}
                >
                  <Clock />
                  <b>{period === "MORNING" ? "Morning" : "Evening"}</b>
                  <span>
                    {period === "MORNING"
                      ? "Before noon"
                      : "Afternoon and evening"}
                  </span>
                  <ArrowRight />
                </button>
              ))}
            </div>
          </ChoiceStep>
        )}
        {step === 5 && (
          <ChoiceStep
            number={5}
            title="Choose an available doctor"
            subtitle={`${
              sessionPeriod === "MORNING" ? "Morning" : "Evening"
            } doctors for ${displayDate(selectedDate)}.`}
            onBack={() => setSessionPeriod("")}
          >
            <div className="doctor-choice">
              {doctorSchedules.map((schedule: any) => {
                const booked = appointments.filter(
                  (item) =>
                    item.doctorId === schedule.doctorId &&
                    item.branchId === branchId &&
                    new Date(item.startsAt) >=
                      new Date(
                        `${selectedDate}T${schedule.startTime}:00+05:30`
                      ) &&
                    new Date(item.startsAt) <
                      new Date(`${selectedDate}T${schedule.endTime}:00+05:30`)
                ).length;
                return (
                  <button
                    key={schedule.id}
                    onClick={() => {
                      setDoctorId(schedule.doctorId);
                      setScheduleId(schedule.id);
                      setPatient(null);
                    }}
                  >
                    <i>
                      <Stethoscope />
                    </i>
                    <div>
                      <b>{schedule.doctor.name}</b>
                      <span>{schedule.doctor.specialization || "General"}</span>
                      <small>
                        {schedule.startTime}–{schedule.endTime} ·{" "}
                        {Math.max(0, schedule.maxPatients - booked)} slots
                        available · ₹{schedule.doctor.consultationFee || 0}
                      </small>
                    </div>
                    <ArrowRight />
                  </button>
                );
              })}
            </div>
          </ChoiceStep>
        )}
        {step === 6 && (
          <ChoiceStep
            number={6}
            title="Select patient"
            subtitle="Search an existing patient or register a new patient."
            onBack={() => {
              setDoctorId("");
              setScheduleId("");
            }}
          >
            <div className="patient-tabs">
              <button
                className={patientMode === "EXISTING" ? "active" : ""}
                onClick={() => setPatientMode("EXISTING")}
              >
                <Search /> Existing patient
              </button>
              <button
                className={patientMode === "NEW" ? "active" : ""}
                onClick={() => {
                  setPatientMode("NEW");
                  setShowNewPatient(true);
                }}
              >
                <Plus /> New patient
              </button>
            </div>
            {patientMode === "EXISTING" && (
              <>
                <label className="wizard-patient-search">
                  <Search />
                  <input
                    autoFocus
                    value={patientSearch}
                    onChange={(event) => setPatientSearch(event.target.value)}
                    placeholder="Search by patient ID, phone number, name or email"
                  />
                </label>
                <div className="wizard-patient-results">
                  {!patientSearch.trim() ? (
                    <Empty text="Start typing a patient ID, phone number, name or email." />
                  ) : patientsLoading ? (
                    <Loading />
                  ) : patientData.items?.length ? (
                    patientData.items.map((item: any) => (
                      <button key={item.id} onClick={() => setPatient(item)}>
                        <i>
                          <UserRound />
                        </i>
                        <div>
                          <b>{item.name}</b>
                          <span>
                            {item.patientNumber} · {item.mobile || "No mobile"}
                          </span>
                        </div>
                        <ArrowRight />
                      </button>
                    ))
                  ) : (
                    <Empty text="No patient found. Try another search or create a new patient." />
                  )}
                </div>
              </>
            )}
          </ChoiceStep>
        )}
        {step === 7 && (
          <form onSubmit={submit}>
            <ChoiceStep
              number={7}
              title="Confirm appointment"
              subtitle="Everything is filled. Select the available time and save."
              onBack={() => setPatient(null)}
            >
              <div className="appointment-summary">
                {[
                  ["Patient", `${patient.name} · ${patient.patientNumber}`],
                  ["Branch", selectedSchedule.branch.name],
                  ["Department", selectedSchedule.doctor.department.name],
                  ["Doctor", selectedDoctor.name],
                  [
                    "Session",
                    sessionPeriod === "MORNING" ? "Morning" : "Evening",
                  ],
                  ["Appointment date", displayDate(selectedDate)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
              <div className="final-fields">
                <label>
                  Available appointment time
                  <select
                    required
                    value={appointmentTime}
                    onChange={(event) => setAppointmentTime(event.target.value)}
                  >
                    <option value="">Select available time</option>
                    {timeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="DRAFT">Draft</option>
                    <option value="BOOKING_PENDING">Booking pending</option>
                    <option value="PAYMENT_PENDING">Payment pending</option>
                  </select>
                </label>
                <label>
                  Payment status
                  <select
                    value={paymentStatus}
                    onChange={(event) => setPaymentStatus(event.target.value)}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="NOT_REQUIRED">Not required</option>
                    <option value="PAID">Paid</option>
                  </select>
                </label>
                {paymentStatus === "PAID" && (
                  <>
                    <label>
                      Payment method
                      <select
                        value={paymentMethod}
                        onChange={(event) =>
                          setPaymentMethod(event.target.value)
                        }
                      >
                        <option value="">Select method</option>
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                      </select>
                    </label>
                    <label>
                      Transaction number
                      <input
                        value={utrNumber}
                        onChange={(event) => setUtrNumber(event.target.value)}
                      />
                    </label>
                    <label>
                      Payment remarks
                      <input
                        value={paymentRemarks}
                        onChange={(event) =>
                          setPaymentRemarks(event.target.value)
                        }
                      />
                    </label>
                  </>
                )}
              </div>
              {book.error && (
                <div className="alert error">
                  {(book.error as any).response?.data?.message ||
                    "Unable to book appointment"}
                </div>
              )}
              <div className="wizard-actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setPatient(null)}
                >
                  Back
                </button>
                <button
                  className="btn"
                  disabled={book.isPending || !timeOptions.length}
                >
                  {book.isPending ? "Booking…" : "Book appointment"}
                </button>
              </div>
            </ChoiceStep>
          </form>
        )}
      </section>
      {showNewPatient && (
        <NewPatientModal
          pending={createPatient.isPending}
          error={(createPatient.error as any)?.response?.data?.message}
          onClose={() => {
            setShowNewPatient(false);
            setPatientMode("EXISTING");
          }}
          onSave={(body: any) => createPatient.mutate(body)}
        />
      )}
    </div>
  );
}

function WizardTitle({ number, title, subtitle }: any) {
  return (
    <div className="wizard-title">
      <div>
        <small>STEP {number}</small>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function ChoiceStep({ number, title, subtitle, onBack, children }: any) {
  return (
    <>
      <button className="wizard-back" onClick={onBack}>
        <ArrowLeft /> Previous step
      </button>
      <WizardTitle number={number} title={title} subtitle={subtitle} />
      {children}
    </>
  );
}
function Choice({ title, subtitle, onClick }: any) {
  return (
    <button className="choice-card" onClick={onClick}>
      <div>
        <b>{title}</b>
        <span>{subtitle || "Available"}</span>
      </div>
      <ArrowRight />
    </button>
  );
}
function Loading() {
  return <div className="wizard-state">Loading available options…</div>;
}
function Empty({ text }: { text: string }) {
  return <div className="wizard-state">{text}</div>;
}
function NewPatientModal({ pending, error, onClose, onSave }: any) {
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(
      Object.fromEntries(
        [...new FormData(event.currentTarget).entries()].filter(([, value]) =>
          String(value).trim(),
        ),
      ),
    );
  };
  return (
    <div className="wizard-modal">
      <form onSubmit={submit}>
        <header>
          <div>
            <small>NEW PATIENT</small>
            <h2>Register patient</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="new-patient-grid">
          <label>
            Full name
            <input name="name" required autoFocus />
          </label>
          <label>
            Mobile number
            <input name="mobile" required minLength={10} />
          </label>
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Gender
            <select name="gender" defaultValue="">
              <option value="">Select gender</option>
              <option>MALE</option>
              <option>FEMALE</option>
              <option>OTHER</option>
            </select>
          </label>
          <label>
            Date of birth
            <input name="dob" type="date" />
          </label>
          <label>
            City
            <input name="city" />
          </label>
          <label className="wide">
            Address
            <textarea name="address" rows={3} />
          </label>
        </div>
        {error && <div className="alert error">{error}</div>}
        <footer>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={pending}>
            {pending ? "Creating…" : "Create and select patient"}
          </button>
        </footer>
      </form>
    </div>
  );
}
