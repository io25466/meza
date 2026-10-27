import { describe, expect, it } from "vitest";
import { buildCaseTimeline } from "./case-timeline";
import { normalizeAppData } from "./models";

describe("case timeline", () => {
  it("combines linked hearings, tasks, payments, agencies, files, expenses, and audit events in descending order", () => {
    const data = normalizeAppData({
      clients: [
        {
          id: "client-1",
          name: "موكل",
          phone: "",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      cases: [
        {
          id: "case-1",
          clientId: "client-1",
          title: "قضية مدنية",
          type: "مدني",
          status: "قائمة",
          totalFees: 100,
          advancePayment: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      tasks: [
        {
          id: "task-1",
          caseId: "case-1",
          title: "تجهيز المرافعة",
          dueDate: "2026-10-20",
          status: "pending",
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      payments: [
        {
          id: "payment-1",
          caseId: "case-1",
          amount: 25,
          date: "2026-10-19",
          kind: "installment",
          method: "cash",
        },
      ],
      powers: [
        {
          id: "power-1",
          clientId: "client-1",
          number: "123",
          date: "2026-10-18",
          capacity: "مرافعة",
        },
      ],
      files: [
        {
          id: "file-1",
          caseId: "case-1",
          title: "مذكرة دفاع.pdf",
          mimeType: "application/pdf",
          encryptedFile: "encrypted",
          createdAt: "2026-10-17T12:00:00.000Z",
        },
      ],
      expenses: [
        {
          id: "expense-1",
          caseId: "case-1",
          amount: 5,
          date: "2026-10-16",
          category: "تنقل",
          createdAt: "2026-10-16T12:00:00.000Z",
        },
      ],
      financialAudit: [
        {
          id: "audit-1",
          recordId: "payment-1",
          kind: "payment",
          action: "created",
          caseId: "case-1",
          createdAt: "2026-10-15T12:00:00.000Z",
        },
      ],
      appointments: [
        {
          id: "apt-1",
          caseId: "case-1",
          title: "جلسة أولى",
          kind: "hearing",
          date: "2026-10-21",
          time: "09:00",
          reminders: [],
        },
        {
          id: "apt-other",
          caseId: "another-case",
          title: "جلسة أخرى",
          kind: "hearing",
          date: "2026-10-22",
          time: "09:00",
          reminders: [],
        },
      ],
    });

    const events = buildCaseTimeline(data, "case-1");
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "appointment",
        "task",
        "payment",
        "power",
        "file",
        "expense",
        "audit",
      ]),
    );
    expect(events.some((event) => event.id === "appointment:apt-other")).toBe(
      false,
    );
    expect(events.map((event) => event.at)).toEqual(
      [...events.map((event) => event.at)].sort((a, b) => b.localeCompare(a)),
    );
    expect(events[0].title).toBe("جلسة");
  });

  it("returns no timeline for a missing case", () => {
    expect(buildCaseTimeline(normalizeAppData({}), "missing")).toEqual([]);
  });
});
