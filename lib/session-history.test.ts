import { describe, expect, it } from "vitest";
import { previousHearingSessions } from "./session-history";
import type { Appointment } from "./models";

const make = (id: string, caseId: string, date: string, status?: Appointment["status"], kind: Appointment["kind"] = "hearing"): Appointment => ({
  id, caseId, title: id, date, time: "10:00", kind, status, reminders: [],
});

describe("previous hearing sessions", () => {
  it("keeps past and explicitly closed sessions for the same case in newest-first order", () => {
    const result = previousHearingSessions([
      make("past", "c1", "2026-06-01"),
      make("future", "c1", "2026-12-01"),
      make("completed", "c1", "2026-11-01", "completed"),
      make("postponed", "c1", "2026-10-25", "postponed"),
      make("cancelled", "c1", "2026-10-24", "cancelled"),
      make("other-case", "c2", "2026-06-02"),
      make("meeting", "c1", "2026-06-03", undefined, "meeting"),
    ], "c1", "2026-10-22");
    expect(result.map((item) => item.id)).toEqual(["completed", "postponed", "cancelled", "past"]);
  });
});
