import type { Appointment } from "./models";

export type AppointmentConflict = { appointment: Appointment; startsAt: Date; endsAt: Date };

function parseAppointment(appointment: Pick<Appointment, "date" | "time" | "durationMinutes">): { startsAt: Date; endsAt: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment.date) || !/^\d{2}:\d{2}$/.test(appointment.time)) return null;
  const startsAt = new Date(`${appointment.date}T${appointment.time}:00`);
  if (Number.isNaN(startsAt.getTime())) return null;
  const duration = Number.isFinite(appointment.durationMinutes) && (appointment.durationMinutes ?? 0) > 0
    ? Math.min(720, appointment.durationMinutes ?? 60)
    : 60;
  return { startsAt, endsAt: new Date(startsAt.getTime() + duration * 60_000) };
}

export function findAppointmentConflicts(appointments: Appointment[], draft: Appointment, editingId?: string): AppointmentConflict[] {
  const interval = parseAppointment(draft);
  if (!interval) return [];
  return appointments
    .filter((appointment) => appointment.id !== editingId && appointment.date === draft.date)
    .flatMap((appointment) => {
      const other = parseAppointment(appointment);
      if (!other || interval.startsAt >= other.endsAt || other.startsAt >= interval.endsAt) return [];
      return [{ appointment, startsAt: other.startsAt, endsAt: other.endsAt }];
    });
}

export function appointmentConflictMessage(conflicts: AppointmentConflict[]): string {
  if (!conflicts.length) return "";
  const first = conflicts[0];
  return conflicts.length === 1
    ? `تنبيه: يتداخل هذا الوقت مع «${first.appointment.title}» عند ${first.appointment.time}. يمكنك المتابعة والحفظ إن لزم.`
    : `تنبيه: يتداخل هذا الوقت مع ${conflicts.length} مواعيد أخرى. يمكنك المتابعة والحفظ إن لزم.`;
}
