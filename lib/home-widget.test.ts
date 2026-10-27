import { describe, expect, it } from "vitest";
import { serializeWidgetSchedule } from "./widget-payload";
import type { Appointment } from "./models";

const item: Appointment = {
  id: "a1", caseId: "c1", title: "جلسة سرية مع اسم الموكل", kind: "hearing",
  date: "2026-10-22", time: "09:30", location: "المحكمة", sessionNotes: "معلومة خاصة", reminders: [],
};

describe("home widget privacy", () => {
  it("shares only date, time and appointment kind and omits cancelled items", () => {
    const result = JSON.parse(serializeWidgetSchedule([
      item,
      { ...item, id: "a2", status: "cancelled", time: "10:00" },
    ], "manus123:///(tabs)/clients?createCase=1"));
    expect(result.appointments).toEqual([{ date: "2026-10-22", time: "09:30", kind: "hearing" }]);
    expect(JSON.stringify(result)).not.toContain("اسم الموكل");
    expect(JSON.stringify(result)).not.toContain("معلومة خاصة");
  });
});
