import { describe, expect, it } from "vitest";
import { buildLegalAssistantMessages, legalAssistantInputSchema } from "./legalAssistant";

describe("legal assistant input", () => {
  it("accepts a question with no law excerpts", () => {
    expect(legalAssistantInputSchema.safeParse({ question: "ما متطلبات صحة العقد؟", excerpts: [] }).success).toBe(true);
  });

  it("rejects more than three explicitly selected excerpts", () => {
    const result = legalAssistantInputSchema.safeParse({
      question: "ما نطاق هذه المواد؟",
      excerpts: ["الأولى", "الثانية", "الثالثة", "الرابعة"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized combined excerpt content", () => {
    const result = legalAssistantInputSchema.safeParse({
      question: "ما أثر هذه النصوص؟",
      excerpts: ["أ".repeat(8_000), "ب".repeat(8_000), "ج".repeat(8_001)],
    });
    expect(result.success).toBe(false);
  });

  it("builds a request only from the question and excerpts passed by the client", () => {
    const input = legalAssistantInputSchema.parse({ question: "فسّر هذا النص القانوني.", excerpts: ["النص المختار"] });
    const messages = buildLegalAssistantMessages(input);
    expect(messages[1].content).toContain("فسّر هذا النص القانوني.");
    expect(messages[1].content).toContain("النص المختار");
    expect(messages[1].content).not.toContain("بيانات الخزنة");
  });
});
