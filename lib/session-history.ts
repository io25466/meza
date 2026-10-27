import type { Appointment } from "./models";

export function previousHearingSessions(
  appointments: Appointment[],
  caseId: string,
  today: string,
): Appointment[] {
  return appointments
    .filter((appointment) =>
      appointment.caseId === caseId &&
      appointment.kind === "hearing" &&
      (appointment.date < today || appointment.status === "completed" || appointment.status === "postponed" || appointment.status === "cancelled"),
    )
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
}
