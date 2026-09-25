import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  FlaskConical,
  Plus,
  ScanLine,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, unwrap } from "../api";
import "./AppointmentBookingPage.css";

type Kind = "lab" | "radiology";
type Patient = {
  id: string;
  name: string;
  mobile?: string;
  patientNumber?: string;
};
type Test = {
  id: string;
  title: string;
  data?: { code?: string; price?: number };
};
type Option = {
  id: string;
  name: string;
  city?: string;
  address?: string;
  role?: string;
  status?: string;
};
type Tube = {
  id: string;
  title: string;
  status: string;
  data?: { sampleType?: string };
};
type Specimen = { tubeType: string; sampleType: string };
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function DiagnosticAppointmentBookingPage({
  kind,
  onSpot = false,
}: {
  kind: Kind;
  onSpot?: boolean;
}) {
  const nav = useNavigate(),
    qc = useQueryClient(),
    lab = kind === "lab",
    label = lab ? "Lab" : "Radiology",
    user = JSON.parse(localStorage.getItem("user") || "{}");
  const now = new Date(),
    today = key(now);
  const [month, setMonth] = useState(
      new Date(now.getFullYear(), now.getMonth(), 1)
    ),
    [step, setStep] = useState(onSpot ? 3 : 1),
    [date, setDate] = useState(onSpot ? today : ""),
    [branch, setBranch] = useState<Option | null>(null);
  const [patientMode, setPatientMode] = useState<"EXISTING" | "NEW">(
      "EXISTING"
    ),
    [search, setSearch] = useState(""),
    [patient, setPatient] = useState<Patient | null>(null);
  const [testSearch, setTestSearch] = useState(""),
    [selected, setSelected] = useState<Test[]>([]),
    [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [time, setTime] = useState("09:00"),
    [technicianId, setTechnicianId] = useState(user.id || ""),
    [priority, setPriority] = useState("ROUTINE"),
    [instructions, setInstructions] = useState(""),
    [doctorId, setDoctorId] = useState(user.id || ""),
    [whatsapp, setWhatsapp] = useState(true);
  const [discount, setDiscount] = useState(0),
    [paymentStatus, setPaymentStatus] = useState("PENDING"),
    [paymentMethod, setPaymentMethod] = useState(""),
    [reference, setReference] = useState("");
  const { data: branchData } = useQuery({
    queryKey: ["diagnostic-branches"],
    queryFn: () => api.get("/crm/branches?limit=100").then(unwrap),
    enabled: !onSpot,
  });
  const { data: patientData = { items: [] }, isFetching } = useQuery({
    queryKey: ["diagnostic-patients", search],
    queryFn: () =>
      api.get("/crm/appointment-patients", { params: { search } }).then(unwrap),
    enabled: step === 3 && patientMode === "EXISTING" && !!search.trim(),
  });
  const { data: testData } = useQuery({
    queryKey: [`${kind}-booking-tests`],
    queryFn: () => api.get(`/crm/modules/${kind}-tests?limit=100`).then(unwrap),
  });
  const { data: doctorData } = useQuery({
    queryKey: ["diagnostic-doctors"],
    queryFn: () => api.get("/crm/doctors?limit=100").then(unwrap),
    enabled: step >= 4,
  });
  const { data: staffData } = useQuery({
    queryKey: ["diagnostic-technicians", kind],
    queryFn: () =>
      lab
        ? api.get("/crm/lab-technicians").then(unwrap)
        : api.get("/crm/staff-accounts").then(unwrap),
    enabled: step >= 4,
  });
  const { data: tubeData } = useQuery({
    queryKey: ["specimen-tubes"],
    queryFn: () => api.get("/crm/modules/specimen-tubes").then(unwrap),
    enabled: lab && step >= 4,
  });
  const branches: Option[] = (branchData?.items || []).filter(
      (x: Option) => x.status !== "INACTIVE"
    ),
    tests: Test[] = testData?.items || [],
    doctors: Option[] = doctorData?.items || [],
    tubes: Tube[] = (tubeData?.items || []).filter(
      (x: Tube) => x.status === "ACTIVE"
    );
  const rawTech: Option[] = lab
    ? staffData || []
    : (staffData?.items || []).filter(
        (x: Option) => x.status === "ACTIVE" && /TECHNICIAN/i.test(x.role || "")
      );
  const self: Option = { id: user.id, name: user.name || "Current user" };
  const technicians = [
    self,
    ...rawTech
      .filter((x) => x.id !== user.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const referringDoctors = [self, ...doctors.filter((x) => x.id !== user.id)];
  const matches = tests
    .filter(
      (x) =>
        !selected.some((y) => y.id === x.id) &&
        `${x.title} ${x.data?.code || ""}`
          .toLowerCase()
          .includes(testSearch.toLowerCase())
    )
    .slice(0, 12);
  const subtotal = useMemo(
      () => selected.reduce((n, x) => n + Number(x.data?.price || 0), 0),
      [selected]
    ),
    total = Math.max(0, subtotal - discount);
  const cells = useMemo(() => {
    const f = new Date(month.getFullYear(), month.getMonth(), 1),
      s = new Date(f);
    s.setDate(1 - f.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(s);
      d.setDate(s.getDate() + i);
      return d;
    });
  }, [month]);
  const createPatient = useMutation({
    mutationFn: (body: object) => api.post("/crm/patients", body).then(unwrap),
    onSuccess: (p: Patient) => {
      setPatient(p);
      setStep(4);
      qc.invalidateQueries({ queryKey: ["diagnostic-patients"] });
    },
  });
  const save = useMutation<any, any, void>({
    mutationFn: () => {
      const tech = technicians.find((x) => x.id === technicianId),
        doctor = referringDoctors.find((x) => x.id === doctorId),
        common = {
          patientId: patient!.id,
          branchId: branch?.id,
          branchName: branch?.name || "Clinic",
          appointmentAt: new Date(`${date}T${time}:00+05:30`).toISOString(),
          testIds: selected.map((x) => x.id),
          testNames: selected.map((x) => x.title).join(", "),
          tests: selected.map((x) => ({
            id: x.id,
            title: x.title,
            price: Number(x.data?.price || 0),
          })),
          technicianId,
          assignedTechnicianId: technicianId,
          assignedTechnicianName: tech?.name,
          referringDoctorId: doctorId || undefined,
          referringDoctorName: doctor?.name,
          instructions,
          priority,
          sendWhatsApp: whatsapp,
          paymentStatus,
          paymentMethod: paymentStatus === "PAID" ? paymentMethod : undefined,
          paymentReference: paymentStatus === "PAID" ? reference : undefined,
          subtotal,
          discountAmount: discount,
          amount: total,
          currency: "INR",
        };
      return lab
        ? api.post("/crm/lab-collections/orders", {
            ...common,
            specimens: specimens.map((x, i) => ({
              ...x,
              tests: [selected[i].title],
            })),
          })
        : api.post("/crm/modules/radiology-appointments", {
            ...common,
            title: `RADIOLOGY-${Date.now().toString(36).toUpperCase()}`,
            status: "CONFIRMED",
          });
    },
    onSuccess: () => {
      window.alert(`${label} appointment booked successfully`);
      nav(`/app/${kind}-appointments`);
    },
  });
  const add = (x: Test) => {
      setSelected((v) => [...v, x]);
      if (lab) setSpecimens((v) => [...v, { tubeType: "", sampleType: "" }]);
      setTestSearch("");
    },
    remove = (id: string) => {
      const i = selected.findIndex((x) => x.id === id);
      setSelected((v) => v.filter((x) => x.id !== id));
      if (lab) setSpecimens((v) => v.filter((_, j) => i !== j));
    };
  const ready =
    !!selected.length &&
    !!technicianId &&
    (!lab || specimens.every((x) => x.tubeType && x.sampleType));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (discount > subtotal)
      return window.alert("Discount cannot be greater than subtotal");
    if (paymentStatus === "PAID" && !paymentMethod)
      return window.alert("Select a payment method");
    if (
      paymentStatus === "PAID" &&
      paymentMethod !== "CASH" &&
      !reference.trim()
    )
      return window.alert("Enter the payment reference");
    save.mutate();
  };
  const names = ["Date", "Branch", "Patient", "Confirm", "Payment"];
  return (
    <div className="booking-wizard diagnostic-wizard">
      <button
        className="schedule-back"
        onClick={() => nav(`/app/${kind}-appointments`)}
      >
        <ArrowLeft /> Back to {label} appointments
      </button>
      <div className="booking-head">
        <div>
          <span>NEW APPOINTMENT</span>
          <h1>Book {label.toLowerCase()} appointment</h1>
          <p>
            Choose the visit details, tests and payment in five simple steps.
          </p>
        </div>
        {lab ? <FlaskConical /> : <ScanLine />}
      </div>
      <nav className="wizard-progress diagnostic-progress">
        {names.map((x, i) => (
          <div
            key={x}
            className={step > i + 1 ? "done" : step === i + 1 ? "active" : ""}
          >
            <i>{step > i + 1 ? <Check /> : i + 1}</i>
            <span>{x}</span>
          </div>
        ))}
      </nav>
      <section className="panel wizard-card" key={step}>
        {step === 1 && (
          <>
            <Title
              n={1}
              title="Choose appointment date"
              text="Select the date when the patient will visit."
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
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
              <div className="days">
                {cells.map((d) => (
                  <button
                    key={key(d)}
                    disabled={key(d) < today}
                    className={`${
                      d.getMonth() !== month.getMonth() ? "outside" : ""
                    } ${key(d) === date ? "selected" : ""}`}
                    onClick={() => {
                      setDate(key(d));
                      setStep(2);
                    }}
                  >
                    {d.getDate()}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <Back fn={() => setStep(1)} />
            <Title
              n={2}
              title="Select branch"
              text="Choose the clinic branch for this appointment."
            />
            <div className="choice-grid">
              {branches.map((x) => (
                <button
                  className="choice-card"
                  key={x.id}
                  onClick={() => {
                    setBranch(x);
                    setStep(3);
                  }}
                >
                  <div>
                    <b>{x.name}</b>
                    <span>
                      {[x.city, x.address].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <ArrowRight />
                </button>
              ))}
            </div>
            {!branches.length && <Empty text="No active branches found." />}
          </>
        )}
        {step === 3 && (
          <>
            <Back fn={() => setStep(2)} />
            <Title
              n={3}
              title="Select patient"
              text="Search an existing patient or register a new patient."
            />
            <div className="patient-tabs">
              <button
                className={patientMode === "EXISTING" ? "active" : ""}
                onClick={() => setPatientMode("EXISTING")}
              >
                <Search /> Existing patient
              </button>
              <button
                className={patientMode === "NEW" ? "active" : ""}
                onClick={() => setPatientMode("NEW")}
              >
                <Plus /> New patient
              </button>
            </div>
            {patientMode === "EXISTING" ? (
              <>
                <label className="wizard-patient-search">
                  <Search />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by patient ID, mobile, name or email"
                  />
                </label>
                <div className="wizard-patient-results">
                  {isFetching ? (
                    <Empty text="Searching…" />
                  ) : (
                    (patientData.items || []).map((x: Patient) => (
                      <button
                        key={x.id}
                        onClick={() => {
                          setPatient(x);
                          setStep(4);
                        }}
                      >
                        <i>
                          <UserRound />
                        </i>
                        <div>
                          <b>{x.name}</b>
                          <span>
                            {x.patientNumber} · {x.mobile}
                          </span>
                        </div>
                        <ArrowRight />
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <NewPatient
                pending={createPatient.isPending}
                save={(x) => createPatient.mutate(x)}
              />
            )}
          </>
        )}
        {step === 4 && (
          <>
            <Back fn={() => setStep(3)} />
            <Title
              n={4}
              title="Confirm appointment"
              text="Select multiple tests and complete the appointment instructions."
            />
            <div className="diagnostic-confirm-grid">
              <div>
                <div className="appointment-summary">
                  <Summary
                    label="Date"
                    value={new Date(`${date}T00:00:00`).toLocaleDateString(
                      "en-IN",
                      { dateStyle: "long" }
                    )}
                  />
                  <Summary
                    label="Branch"
                    value={branch?.name || "On-the-spot"}
                  />
                  <Summary label="Patient" value={patient?.name || ""} />
                  <Summary
                    label="Patient ID"
                    value={patient?.patientNumber || "New patient"}
                  />
                </div>
                <div className="final-fields diagnostic-details">
                  <label>
                    Appointment time *
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </label>
                  <label>
                    Priority
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="ROUTINE">Routine</option>
                      <option value="URGENT">Urgent</option>
                      <option value={lab ? "STAT" : "EMERGENCY"}>
                        {lab ? "STAT" : "Emergency"}
                      </option>
                    </select>
                  </label>
                  <label>
                    Assigned technician *
                    <select
                      value={technicianId}
                      onChange={(e) => setTechnicianId(e.target.value)}
                    >
                      <option value="">Select technician</option>
                      {technicians.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.id === user.id ? `Self (${x.name})` : x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Referred by doctor
                    <select
                      value={doctorId}
                      onChange={(e) => setDoctorId(e.target.value)}
                    >
                      <option value="">No referring doctor</option>
                      {referringDoctors.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.id === user.id ? `Self (${x.name})` : x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    Instructions
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Fasting, preparation or collection instructions"
                    />
                  </label>
                  <label className="whatsapp-opt-in">
                    <input
                      type="checkbox"
                      checked={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.checked)}
                    />{" "}
                    Send appointment confirmation to the patient on WhatsApp
                  </label>
                </div>
              </div>
              <aside className="test-picker">
                <h3>{lab ? "Pathology" : "Radiology"} tests</h3>
                <div className="patient-search">
                  <div className="smart-select-input">
                    <Search />
                    <input
                      value={testSearch}
                      onChange={(e) => setTestSearch(e.target.value)}
                      placeholder="Search and add multiple tests"
                    />
                  </div>
                  {testSearch && (
                    <div className="patient-results">
                      {matches.map((x) => (
                        <button
                          type="button"
                          key={x.id}
                          onMouseDown={() => add(x)}
                        >
                          <strong>{x.title}</strong>
                          <span>{money(Number(x.data?.price || 0))}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="selected-tests">
                  {selected.map((x, i) => (
                    <article key={x.id}>
                      <div>
                        <b>{x.title}</b>
                        {lab && (
                          <select
                            value={specimens[i]?.tubeType || ""}
                            onChange={(e) => {
                              const t = tubes.find(
                                (x) => x.title === e.target.value
                              );
                              setSpecimens((v) =>
                                v.map((r, j) =>
                                  j === i
                                    ? {
                                        tubeType: e.target.value,
                                        sampleType: t?.data?.sampleType || "",
                                      }
                                    : r
                                )
                              );
                            }}
                          >
                            <option value="">Select specimen tube *</option>
                            {tubes.map((t) => (
                              <option key={t.id}>{t.title}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <strong>{money(Number(x.data?.price || 0))}</strong>
                      <button type="button" onClick={() => remove(x.id)}>
                        <Trash2 />
                      </button>
                    </article>
                  ))}
                </div>
                <div className="booking-totals">
                  <p>
                    <span>Selected tests</span>
                    <b>{selected.length}</b>
                  </p>
                  <p className="grand-total">
                    <span>Grand total</span>
                    <b>{money(subtotal)}</b>
                  </p>
                </div>
              </aside>
            </div>
            <div className="wizard-actions">
              <button
                className="btn"
                disabled={!ready}
                onClick={() => setStep(5)}
              >
                Continue to payment <ArrowRight />
              </button>
            </div>
          </>
        )}
        {step === 5 && (
          <form onSubmit={submit}>
            <Back fn={() => setStep(4)} />
            <Title
              n={5}
              title="Final payment"
              text="Apply the discount and record how the patient will pay."
            />
            <div className="payment-final-card">
              <div className="booking-totals">
                <p>
                  <span>Tests ({selected.length})</span>
                  <b>{money(subtotal)}</b>
                </p>
                <label>
                  Discount amount
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                  />
                </label>
                <p className="grand-total">
                  <span>Grand total</span>
                  <b>{money(total)}</b>
                </p>
              </div>
              <div className="final-fields">
                <label>
                  Payment status
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="PARTIALLY_PAID">Partially paid</option>
                    <option value="PAID">Paid</option>
                  </select>
                </label>
                {paymentStatus === "PAID" && (
                  <>
                    <label>
                      Payment method
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      >
                        <option value="">Select method</option>
                        <option value="CASH">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="CARD">Card</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                      </select>
                    </label>
                    <label>
                      Reference / transaction number
                      <input
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder={
                          paymentMethod === "CASH"
                            ? "Optional for cash"
                            : "Required"
                        }
                      />
                    </label>
                  </>
                )}
              </div>
              {save.error && (
                <div className="alert error">
                  {(save.error as any)?.response?.data?.message ||
                    "Unable to book appointment"}
                </div>
              )}
              <div className="wizard-actions">
                <button className="btn" disabled={save.isPending}>
                  <CalendarCheck />
                  {save.isPending ? "Booking…" : `Confirm ${label} appointment`}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
function Title({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="wizard-title">
      <small>STEP {n}</small>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function Back({ fn }: { fn: () => void }) {
  return (
    <button type="button" className="wizard-back" onClick={fn}>
      <ArrowLeft /> Back
    </button>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="wizard-state">{text}</div>;
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
function NewPatient({
  pending,
  save,
}: {
  pending: boolean;
  save: (x: object) => void;
}) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    save(Object.fromEntries(new FormData(e.currentTarget)));
  };
  return (
    <form className="new-patient-grid inline-new-patient" onSubmit={submit}>
      <label>
        Patient name *<input name="name" required />
      </label>
      <label>
        Mobile number *<input name="mobile" required inputMode="tel" />
      </label>
      <label>
        Email
        <input name="email" type="email" />
      </label>
      <label>
        Gender
        <select name="gender">
          <option value="OTHER">Other</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
      </label>
      <button className="btn" disabled={pending}>
        {pending ? "Registering…" : "Register and continue"}
      </button>
    </form>
  );
}
