import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentBookingPage } from "./AppointmentBookingPage";

const mocks = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn(), step: 6, mutations: [] as any[], schedules: [] as any[], appointments: [] as any[] }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: any) => actual.useState(initial === 1 ? mocks.step : initial) };
});
vi.mock("../api", () => ({ api: { patch: mocks.patch, post: mocks.post }, unwrap: (value: any) => value }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: { schedules: mocks.schedules, appointments: mocks.appointments } }),
  useMutation: (options: any) => { mocks.mutations.push(options); return { isPending: false }; },
}));

const appointment = {
  id: "older-appointment", patientId: "patient", branchId: "branch", departmentId: "department", doctorId: "doctor",
  startsAt: "2026-10-01T20:00:00Z", endsAt: "2026-10-01T20:30:00Z", status: "COMPLETED", paymentStatus: "PAID",
  patient: { id: "patient", name: "Saved Patient", patientNumber: "P100" },
  branch: { id: "branch", name: "Saved Branch" }, department: { id: "department", name: "Saved Department" },
  doctor: { id: "doctor", name: "Saved Doctor" },
};

describe("appointment editing", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.step = 6; mocks.mutations.length = 0; mocks.schedules = []; mocks.appointments = []; });
  it("prefills saved details and the clinic date even without a current schedule", () => {
    const html = renderToStaticMarkup(<AppointmentBookingPage appointment={appointment} />);
    for (const text of ["Edit doctor appointment", "Saved Patient", "Saved Branch", "Saved Department", "Saved Doctor", "Save changes"]) expect(html).toContain(text);
    expect(html).toMatch(/2 October,? 2026/);
    expect(html).toContain('value="2026-10-01T20:00:00.000Z" selected=""');
    expect(html).toContain('value="COMPLETED" selected=""');
    expect(html).toContain('value="PAID" selected=""');
  });
  it("updates the original record without creating a booking or repeating payment", async () => {
    renderToStaticMarkup(<AppointmentBookingPage appointment={appointment} />);
    await mocks.mutations.at(-1).mutationFn();
    expect(mocks.patch).toHaveBeenCalledWith("/crm/appointments/older-appointment", {
      patientId: "patient", branchId: "branch", departmentId: "department", doctorId: "doctor",
    });
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("keeps the current appointment slot available but excludes other occupied slots", () => {
    mocks.schedules = [{ id: "schedule", doctorId: "doctor", branchId: "branch", startTime: "01:30", endTime: "02:30", maxPatients: 2, slotMinutes: 30, branch: appointment.branch, doctor: { ...appointment.doctor, departmentId: "department", department: appointment.department } }];
    mocks.appointments = [appointment, { ...appointment, id: "other", startsAt: "2026-10-01T20:30:00Z", endsAt: "2026-10-01T21:00:00Z" }];
    const html = renderToStaticMarkup(<AppointmentBookingPage appointment={appointment} />);
    expect(html).toMatch(/2 October,? 2026/);
    expect(html).toContain('value="2026-10-01T20:00:00.000Z" selected=""');
    expect(html).not.toContain('value="2026-10-01T20:30:00.000Z"');
  });
  it("opens editing at the saved calendar month with the saved day highlighted", () => {
    mocks.step = 1;
    const html = renderToStaticMarkup(<AppointmentBookingPage appointment={appointment} />);
    expect(html).toContain("Choose appointment date");
    expect(html).toContain("October 2026");
    expect(html).toMatch(/class=" selected">2<\/button>/);
    expect(html).toContain("Continue");
    expect(html).not.toContain("Save changes");
  });
  it.each([[2, "Saved Branch"], [3, "Saved Department"], [4, "Saved Doctor"], [5, "Saved Patient"]])("shows the saved selection at step %s", (step, name) => {
    mocks.step = Number(step);
    const html = renderToStaticMarkup(<AppointmentBookingPage appointment={appointment} />);
    expect(html).toContain(name);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Continue");
  });
  it("still opens a blank date selection for new bookings", () => {
    mocks.step = 1;
    const html = renderToStaticMarkup(<AppointmentBookingPage />);
    expect(html).toContain("NEW APPOINTMENT");
    expect(html).toContain("Choose appointment date");
    expect(html).not.toContain("Save changes");
  });
});
