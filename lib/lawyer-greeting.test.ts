import { describe, expect, it } from "vitest";
import { lawyerGreeting } from "./lawyer-greeting";

describe("lawyer greeting", () => {
  it("uses the requested default when the name is blank", () => {
    expect(lawyerGreeting("  ", new Date(2026, 0, 1, 9))).toBe("مرحباً بك، سيادة المستشار");
  });

  it("greets by local time of day when a name is available", () => {
    expect(lawyerGreeting("ليلى", new Date(2026, 0, 1, 8))).toBe("أسعد الله صباحك، الأستاذ ليلى");
    expect(lawyerGreeting("ليلى", new Date(2026, 0, 1, 15))).toBe("مرحباً بك، الأستاذ ليلى");
    expect(lawyerGreeting("ليلى", new Date(2026, 0, 1, 21))).toBe("أسعد الله مساءك، الأستاذ ليلى");
  });
});
