import { describe, expect, it } from "vitest";
import { isValidISODate, paymentStatus, remainingBalance, totalPaid, type LegalCase, type Payment } from "./models";

const legalCase: LegalCase = {
  id: "case_1",
  clientId: "client_1",
  title: "مطالبة مالية",
  type: "مدني",
  status: "قائمة",
  totalFees: 12000,
  advancePayment: 3000,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const installments: Payment[] = [
  { id: "p1", caseId: "case_1", amount: 2000, date: "2026-01-10", kind: "installment" },
  { id: "p2", caseId: "other_case", amount: 9000, date: "2026-01-11", kind: "installment" },
];

describe("financial calculations", () => {
  it("subtracts the advance and only this case's installments", () => {
    expect(totalPaid(legalCase, installments)).toBe(5000);
    expect(remainingBalance(legalCase, installments)).toBe(7000);
    expect(paymentStatus(legalCase, installments)).toBe("partial");
  });

  it("reports fully paid when advance plus installments reaches the agreed fees", () => {
    const payments = [...installments, { id: "p3", caseId: "case_1", amount: 7000, date: "2026-01-12", kind: "installment" as const }];
    expect(remainingBalance(legalCase, payments)).toBe(0);
    expect(paymentStatus(legalCase, payments)).toBe("paid");
  });

  it("uses explicit advance records instead of adding the same legacy case advance twice", () => {
    const payments: Payment[] = [{ id: "advance1", caseId: "case_1", amount: 3000, date: "2026-01-02", kind: "advance" }];
    expect(totalPaid(legalCase, payments)).toBe(3000);
    expect(remainingBalance(legalCase, payments)).toBe(9000);
  });

  it("treats a zero-fee case as having no outstanding amount", () => {
    const noFeeCase = { ...legalCase, totalFees: 0, advancePayment: 0 };
    expect(paymentStatus(noFeeCase, [])).toBe("paid");
  });

  it("accepts real ISO dates and rejects impossible calendar dates", () => {
    expect(isValidISODate("2026-10-18")).toBe(true);
    expect(isValidISODate("2026-99-99")).toBe(false);
    expect(isValidISODate("not-a-date")).toBe(false);
  });

  it("does not allow the displayed balance to go below zero", () => {
    const excessive = [{ id: "p1", caseId: "case_1", amount: 20000, date: "2026-01-10", kind: "installment" as const }];
    expect(remainingBalance(legalCase, excessive)).toBe(0);
  });
});
