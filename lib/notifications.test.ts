import { describe, expect, it } from "vitest";
import { appointmentReminderMessage } from "./notification-copy";

describe("private appointment notifications", () => {
  it("uses generic copy for a hearing 24 hours ahead", () => {
    expect(appointmentReminderMessage("hearing", 24 * 60 * 60 * 1000)).toEqual({
      title: "تذكير ميزان",
      body: "لديك جلسة قانونية بعد 24 ساعة",
    });
  });

  it("uses generic copy for a meeting one hour ahead", () => {
    expect(appointmentReminderMessage("meeting", 60 * 60 * 1000)).toEqual({
      title: "تذكير ميزان",
      body: "لديك اجتماع بعد ساعة",
    });
  });
});
