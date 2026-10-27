import { describe, expect, it } from "vitest";
import { appointmentConflictMessage, findAppointmentConflicts } from "./appointment-conflicts";
import type { Appointment } from "./models";

const appointment = (id: string, time: string, durationMinutes = 60): Appointment => ({ id, title: `موعد ${id}`, kind: "hearing", date: "2026-10-20", time, durationMinutes, reminders: [] });

describe("appointment conflict warnings", () => {
  it("detects overlap using user-defined duration", () => {
    const conflicts = findAppointmentConflicts([appointment("a", "09:00", 90)], appointment("draft", "10:00", 60));
    expect(conflicts).toHaveLength(1);
    expect(appointmentConflictMessage(conflicts)).toContain("يمكنك المتابعة والحفظ");
  });
  it("does not report adjacent appointments or a changed record against itself", () => {
    expect(findAppointmentConflicts([appointment("a", "09:00", 60)], appointment("draft", "10:00", 60))).toHaveLength(0);
    expect(findAppointmentConflicts([appointment("a", "09:00", 60)], appointment("a", "09:30", 90), "a")).toHaveLength(0);
  });
  it("ignores appointments on other days and malformed times", () => {
    const otherDay = { ...appointment("a", "09:00"), date: "2026-10-21" };
    expect(findAppointmentConflicts([otherDay, appointment("b", "99:99")], appointment("draft", "09:30"))).toHaveLength(0);
  });
});
