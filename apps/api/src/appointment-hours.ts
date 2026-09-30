import { z } from "zod";

export const appointmentHoursMessage = "Doctor appointments must start at or after 7:00 AM and finish by 10:00 PM (IST)";

export function scheduleEnd(startTime: string, slotMinutes: number, maxPatients: number) {
  z.string().regex(/^\d{2}:[0-5]\d$/).parse(startTime);
  z.number().int().positive().parse(slotMinutes);
  z.number().int().positive().parse(maxPatients);
  const [hours, minutes] = startTime.split(":").map(Number);
  const start = hours * 60 + minutes;
  const end = start + slotMinutes * maxPatients;
  z.boolean().refine(Boolean, appointmentHoursMessage).parse(start >= 420 && end <= 1320);
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export function validateAppointmentHours(startsAt: Date, endsAt: Date) {
  const localStart = new Date(startsAt.getTime() + 330 * 60000);
  const localEnd = new Date(endsAt.getTime() + 330 * 60000);
  const dayStart = Date.UTC(localStart.getUTCFullYear(), localStart.getUTCMonth(), localStart.getUTCDate());
  z.boolean().refine(Boolean, appointmentHoursMessage).parse(
    localStart.getTime() >= dayStart + 420 * 60000 &&
    localEnd.getTime() <= dayStart + 1320 * 60000 && endsAt > startsAt,
  );
}
