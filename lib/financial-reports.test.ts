import { describe, expect, it } from "vitest";
import { EMPTY_DATA } from "./models";
import { monthlyFinancialReport } from "./financial-reports";

describe("monthly financial reports", () => {
  it("groups dated receipts, outstanding balances and expenses by client", () => {
    const data = {
      ...EMPTY_DATA,
      clients: [{ id: "c1", name: "سارة", phone: "", createdAt: "2026-01-01" }],
      cases: [{ id: "case1", clientId: "c1", title: "دعوى", type: "مدني", status: "قائمة", totalFees: 1000, advancePayment: 200, advancePaymentDate: "2026-03-02", createdAt: "2026-03-01" }],
      payments: [{ id: "p1", caseId: "case1", amount: 100, date: "2026-03-05", kind: "installment" as const }],
      expenses: [{ id: "e1", amount: 40, date: "2026-03-06", category: "تنقل", caseId: "case1", createdAt: "2026-03-06" }],
    };
    const report = monthlyFinancialReport(data, "2026-03");
    expect(report.receipts).toBe(300);
    expect(report.outstanding).toBe(700);
    expect(report.expenses).toBe(40);
    expect(report.byClient.find((item) => item.clientId === "c1")).toMatchObject({ receipts: 300, outstanding: 700, expenses: 40 });
    expect(report.estimatedLegacyAdvances).toBe(0);
  });

  it("marks an advance without an explicit date as estimated using the case entry date", () => {
    const data = {
      ...EMPTY_DATA,
      cases: [{ id: "case1", clientId: "unknown", title: "دعوى", type: "مدني", status: "قائمة", totalFees: 1000, advancePayment: 250, createdAt: "2026-02-10T10:00:00.000Z" }],
    };
    expect(monthlyFinancialReport(data, "2026-02")).toMatchObject({ receipts: 250, estimatedLegacyAdvances: 250 });
    expect(monthlyFinancialReport(data, "2026-01").receipts).toBe(0);
  });

  it("does not count both a recorded advance and the legacy case advance", () => {
    const data = {
      ...EMPTY_DATA,
      cases: [{ id: "case1", clientId: "c1", title: "دعوى", type: "مدني", status: "قائمة", totalFees: 1000, advancePayment: 200, advancePaymentDate: "2026-03-02", createdAt: "2026-03-01" }],
      payments: [{ id: "advance1", caseId: "case1", amount: 200, date: "2026-03-02", kind: "advance" as const }],
    };
    expect(monthlyFinancialReport(data, "2026-03")).toMatchObject({ receipts: 200, outstanding: 800, estimatedLegacyAdvances: 0 });
  });
});
