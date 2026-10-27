import type { Appointment } from "./models";

export function serializeWidgetSchedule(appointments: Appointment[], createCaseUrl: string): string {
  const safeAppointments = appointments
    .filter((item) => item.status !== "cancelled" && item.status !== "completed")
    .map(({ date, time, kind }) => ({ date, time, kind }))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  return JSON.stringify({ appointments: safeAppointments, createCaseUrl });
}
