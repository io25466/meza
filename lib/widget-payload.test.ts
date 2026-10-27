import { describe, expect, it } from "vitest";
import { serializeWidgetSchedule } from "./widget-payload";

const appointment = {
  id: "a1", caseId: "case-secret", title: "جلسة موكل سري", kind: "hearing" as const,
  date: "2026-10-23", time: "09:30", location: "محكمة خاصة", sessionNotes: "ملاحظة حساسة",
  decision: "قرار سري", reminders: [],
};

describe("widget schedule privacy", () => {
  it("serializes only date, time and kind, and omits cancelled/completed hearings", () => {
    const payload = JSON.parse(serializeWidgetSchedule([
      appointment,
      { ...appointment, id: "done", status: "completed" as const },
      { ...appointment, id: "cancelled", status: "cancelled" as const },
    ], "mizan:///(tabs)/clients?createCase=1"));
    expect(payload.appointments).toEqual([{ date: "2026-10-23", time: "09:30", kind: "hearing" }]);
    expect(JSON.stringify(payload)).not.toMatch(/سري|case-secret|محكمة خاصة/);
  });
});
