import { useEffect, useState } from "react";
import { useMutation, useQueries } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeIndianRupee,
  CalendarCheck,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, unwrap } from "../api";
import { Option, SearchSelect } from "./AppointmentFields";
const list = (data: any) => (Array.isArray(data) ? data : data?.items || []);
export function AppointmentBookingPage({
  appointment: existingAppointment,
}: { appointment?: any } = {}) {
  const navigate = useNavigate(),
    endpoints = [
      "patients",
      "branches",
      "departments",
      "doctors",
      "doctorSchedules",
      "appointments",
    ],
    queries = useQueries({
      queries: endpoints.map((endpoint) => ({
        queryKey: ["new-appointment", endpoint],
        queryFn: () => api.get(`/crm/${endpoint}?limit=100`).then(unwrap),
      })),
    }),
    patients = list(queries[0].data),
    branches = list(queries[1].data),
    departments = list(queries[2].data),
    doctors = list(queries[3].data),
    schedules = list(queries[4].data),
    appointments = list(queries[5].data),
    [patientId, setPatientId] = useState(""),
    [branchId, setBranchId] = useState(""),
    [departmentId, setDepartmentId] = useState(""),
    [doctorId, setDoctorId] = useState(""),
    [scheduleId, setScheduleId] = useState(""),
    [status, setStatus] = useState("CONFIRMED"),
    [paymentStatus, setPaymentStatus] = useState("PENDING"),
    [paymentMethod, setPaymentMethod] = useState(""),
    [utrNumber, setUtrNumber] = useState(""),
    [paymentRemarks, setPaymentRemarks] = useState(""),
    patient = patients.find((item: any) => item.id === patientId),
    doctor = doctors.find((item: any) => item.id === doctorId);
  useEffect(() => {
    if (!existingAppointment || patientId || !schedules.length) return;
    setPatientId(existingAppointment.patientId || "");
    setBranchId(existingAppointment.branchId || "");
    setDepartmentId(existingAppointment.departmentId || "");
    setDoctorId(existingAppointment.doctorId || "");
    setStatus(existingAppointment.status || "CONFIRMED");
    setPaymentStatus(existingAppointment.paymentStatus || "PENDING");
    const date = existingAppointment.startsAt?.slice(0, 10);
    const schedule = schedules.find(
      (item: any) =>
        item.doctorId === existingAppointment.doctorId &&
        item.branchId === existingAppointment.branchId &&
        item.scheduleDate?.slice(0, 10) === date,
    );
    if (schedule) setScheduleId(schedule.id);
  }, [existingAppointment, schedules, patientId]);
  const patientOptions: Option[] = patients.map((item: any) => ({
      id: item.id,
      label: `${item.name} · ${item.mobile || "No phone"} · ${item.patientNumber}`,
      search: `${item.name} ${item.mobile} ${item.patientNumber} ${item.id} ${item.email} ${item.city}`,
      raw: item,
    })),
    branchOptions: Option[] = branches.map((item: any) => ({
      id: item.id,
      label: `${item.name} · ${item.city || ""}`,
      search: `${item.name} ${item.city} ${item.id}`,
      raw: item,
    })),
    departmentOptions: Option[] = departments.map((item: any) => ({
      id: item.id,
      label: `${item.name} · ${item.code}`,
      search: `${item.name} ${item.code} ${item.id}`,
      raw: item,
    })),
    scheduledDoctorIds = new Set(
      schedules
        .filter(
          (item: any) =>
            (!branchId || item.branchId === branchId) &&
            item.status === "ACTIVE",
        )
        .map((item: any) => item.doctorId),
    ),
    doctorOptions: Option[] = doctors
      .filter(
        (item: any) =>
          (!departmentId || item.departmentId === departmentId) &&
          (!branchId || scheduledDoctorIds.has(item.id)),
      )
      .map((item: any) => ({
        id: item.id,
        label: `${item.name} · ${item.specialization || "General"} · ₹${item.consultationFee || 0}`,
        search: `${item.name} ${item.specialization} ${item.registrationNumber} ${item.mobile} ${item.id}`,
        raw: item,
      })),
    slotDateOptions: Option[] = schedules
      .filter(
        (item: any) =>
          item.doctorId === doctorId &&
          item.branchId === branchId &&
          item.status === "ACTIVE" &&
          item.scheduleDate &&
          new Date(item.scheduleDate) >=
            new Date(new Date().toISOString().slice(0, 10)),
      )
      .map((item: any) => {
        const date = item.scheduleDate.slice(0, 10),
          used = appointments.filter(
            (appointment: any) =>
              appointment.id !== existingAppointment?.id &&
              appointment.doctorId === doctorId &&
              appointment.branchId === branchId &&
              appointment.status !== "CANCELLED" &&
              appointment.startsAt?.slice(0, 10) === date,
          ).length,
          remaining = Math.max(0, item.maxPatients - used);
        return {
          id: item.id,
          label: `${new Date(item.scheduleDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} (${remaining} slots left)`,
          search: `${date} ${remaining}`,
          raw: { ...item, remaining },
        };
      })
      .filter((item: Option) => item.raw.remaining > 0)
      .filter(
        (item: Option) =>
          !appointments.some(
            (appointment: any) =>
              appointment.id !== existingAppointment?.id &&
              appointment.patientId === patientId &&
              appointment.doctorId === doctorId &&
              appointment.status !== "CANCELLED" &&
              appointment.startsAt?.slice(0, 10) ===
                item.raw.scheduleDate.slice(0, 10),
          ),
      )
      .sort((a: Option, b: Option) =>
        a.raw.scheduleDate.localeCompare(b.raw.scheduleDate),
      );
  const book = useMutation({
      mutationFn: () => {
        if (existingAppointment) {
          const schedule = schedules.find(
              (item: any) => item.id === scheduleId,
            ),
            date = schedule?.scheduleDate?.slice(0, 10),
            sameDate = existingAppointment.startsAt?.slice(0, 10) === date;
          const used = appointments.filter(
            (item: any) =>
              item.id !== existingAppointment.id &&
              item.doctorId === doctorId &&
              item.branchId === branchId &&
              item.status !== "CANCELLED" &&
              item.startsAt?.slice(0, 10) === date,
          ).length;
          const startDate = sameDate
            ? new Date(existingAppointment.startsAt)
            : new Date(
                new Date(`${date}T${schedule.startTime}:00+05:30`).getTime() +
                  used * schedule.slotMinutes * 60000,
              );
          return api.patch(`/crm/appointments/${existingAppointment.id}`, {
            patientId,
            branchId,
            departmentId,
            doctorId,
            startsAt: startDate.toISOString(),
            endsAt: new Date(
              startDate.getTime() + Number(schedule.slotMinutes || 30) * 60000,
            ).toISOString(),
            amount: doctor?.consultationFee || 0,
            status,
            paymentStatus,
          });
        }
        return api.post("/crm/appointments/book", {
          patientId,
          branchId,
          departmentId,
          doctorId,
          scheduleId,
          status,
          paymentStatus,
          paymentMethod: paymentStatus === "PAID" ? paymentMethod : undefined,
          utrNumber: paymentStatus === "PAID" ? utrNumber : undefined,
          paymentRemarks: paymentStatus === "PAID" ? paymentRemarks : undefined,
        });
      },
      onSuccess: (response: any) => {
        window.alert(
          existingAppointment
            ? "Appointment updated successfully"
            : `Appointment booked successfully\nToken: ${response.data.data.token}\nTime: ${new Date(response.data.data.startsAt).toLocaleString("en-IN")}`,
        );
        navigate("/app/appointments");
      },
    }),
    submit = (event: React.FormEvent) => {
      event.preventDefault();
      if (
        !patientId ||
        !branchId ||
        !departmentId ||
        !doctorId ||
        !scheduleId
      ) {
        window.alert(
          "Please select patient, branch, department, doctor and appointment date",
        );
        return;
      }
      const selectedSchedule = schedules.find(
          (item: any) => item.id === scheduleId,
        ),
        selectedDate = selectedSchedule?.scheduleDate?.slice(0, 10),
        duplicate = appointments.some(
          (appointment: any) =>
            appointment.id !== existingAppointment?.id &&
            appointment.patientId === patientId &&
            appointment.doctorId === doctorId &&
            appointment.status !== "CANCELLED" &&
            appointment.startsAt?.slice(0, 10) === selectedDate,
        );
      if (duplicate) {
        window.alert(
          "This patient already has an appointment with this doctor on this date.",
        );
        return;
      }
      if (
        paymentStatus === "PAID" &&
        !paymentMethod &&
        existingAppointment?.paymentStatus !== "PAID"
      ) {
        window.alert("Please select a payment method");
        return;
      }
      if (
        paymentStatus === "PAID" &&
        paymentMethod &&
        paymentMethod !== "CASH" &&
        !utrNumber.trim()
      ) {
        window.alert("Please enter the UTR or transaction number");
        return;
      }
      book.mutate();
    };
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
          <span>
            {existingAppointment ? "EDIT APPOINTMENT" : "NEW APPOINTMENT"}
          </span>
          <h1>
            {existingAppointment ? "Edit appointment" : "Book appointment"}
          </h1>
          <p>
            {existingAppointment
              ? "Update the appointment using the same booking workflow."
              : "The next time slot and token are generated automatically."}
          </p>
        </div>
        <CalendarCheck />
      </div>
      <form onSubmit={submit} className="booking-layout">
        <section className="panel booking-form">
          <h2>Appointment information</h2>
          <div className="booking-grid">
            <SearchSelect
              name="patientId"
              label="Patient"
              options={patientOptions}
              value={patientId}
              onChange={setPatientId}
              placeholder="Search name, phone, patient ID or email"
            />
            <SearchSelect
              name="branchId"
              label="Branch"
              options={branchOptions}
              value={branchId}
              onChange={(id) => {
                setBranchId(id);
                setDoctorId("");
                setScheduleId("");
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
                setScheduleId("");
              }}
              placeholder="Search department name or code"
            />
            <SearchSelect
              name="doctorId"
              label="Doctor"
              options={doctorOptions}
              value={doctorId}
              onChange={(id) => {
                setDoctorId(id);
                setScheduleId("");
              }}
              placeholder={
                branchId ? "Search doctor or speciality" : "Select branch first"
              }
              disabled={!branchId}
            />
            <div className="wide">
              <SearchSelect
                name="scheduleId"
                label="Available appointment date"
                options={slotDateOptions}
                value={scheduleId}
                onChange={setScheduleId}
                placeholder={
                  doctorId
                    ? "Search date and remaining slots"
                    : "Select doctor first"
                }
                disabled={!doctorId}
              />
              {patientId && doctorId && !slotDateOptions.length && (
                <div className="alert error">
                  No date is available. This patient may already be booked with
                  this doctor, or all slots are full.
                </div>
              )}
            </div>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
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
                onChange={(e) => {
                  setPaymentStatus(e.target.value);
                  if (e.target.value !== "PAID") {
                    setPaymentMethod("");
                    setUtrNumber("");
                    setPaymentRemarks("");
                  }
                }}
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
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    required={existingAppointment?.paymentStatus !== "PAID"}
                  >
                    <option value="">Select payment method</option>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </label>
                <label>
                  UTR / transaction number
                  <input
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    placeholder={
                      paymentMethod === "CASH"
                        ? "Optional for cash"
                        : "Enter payment reference"
                    }
                    required={!!paymentMethod && paymentMethod !== "CASH"}
                  />
                </label>
                <label className="wide payment-remarks">
                  Payment remarks
                  <textarea
                    value={paymentRemarks}
                    onChange={(e) => setPaymentRemarks(e.target.value)}
                    placeholder="Add payment notes (optional)"
                    rows={3}
                  />
                </label>
              </>
            )}
          </div>
          {book.error && (
            <div className="alert error">
              {(book.error as any).response?.data?.message ||
                (existingAppointment
                  ? "Unable to update appointment"
                  : "Unable to book appointment")}
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
            <button className="btn" disabled={book.isPending}>
              {book.isPending
                ? "Saving…"
                : existingAppointment
                  ? "Save changes"
                  : "Book appointment"}
            </button>
          </div>
        </section>
        <aside>
          <section className="panel patient-preview">
            <h2>Selected patient</h2>
            {patient ? (
              <>
                <div className="patient-avatar">
                  <UserRound />
                  <b>{patient.name}</b>
                  <span>{patient.patientNumber}</span>
                </div>
                <dl>
                  <div>
                    <dt>
                      <Phone /> Phone
                    </dt>
                    <dd>{patient.mobile || "—"}</dd>
                  </div>
                  <div>
                    <dt>
                      <Mail /> Email
                    </dt>
                    <dd>{patient.email || "—"}</dd>
                  </div>
                  <div>
                    <dt>
                      <MapPin /> City
                    </dt>
                    <dd>{patient.city || "—"}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p>Search and select a patient to view contact details.</p>
            )}
          </section>
          <section className="panel fee-preview">
            <BadgeIndianRupee />
            <div>
              <span>Consultation fee</span>
              <strong>₹{doctor?.consultationFee || 0}</strong>
              <small>{doctor?.name || "Select a doctor"}</small>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
}
