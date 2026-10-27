import { describe, expect, it } from "vitest";
import { EMPTY_DATA, type Payment } from "./models";
import { addAuditEntry, auditExpenseRestore, auditPaymentChange, auditPaymentRestore } from "./financial-audit";

const payment: Payment = { id: "p1", caseId: "k1", amount: 100, date: "2026-10-01", kind: "installment", method: "cash" };

describe("local financial audit entries", () => {
  it("stores creation, correction and void as separate before/after events", () => {
    const created = auditPaymentChange(undefined, payment, "c1");
    const corrected = auditPaymentChange(payment, { ...payment, amount: 90, method: "bank_transfer" }, "c1", "تصحيح المبلغ");
    const voided = auditPaymentChange(payment, undefined, "c1", "إلغاء بعد التأكيد");
    expect(created?.action).toBe("created");
    expect(created?.after?.paymentKind).toBe("installment");
    expect(corrected?.before?.amount).toBe(100);
    expect(corrected?.after?.amount).toBe(90);
    expect(corrected?.reason).toBe("تصحيح المبلغ");
    expect(voided?.action).toBe("voided");
    expect(voided?.before?.amount).toBe(100);
    expect(addAuditEntry(EMPTY_DATA, created).financialAudit).toHaveLength(1);
  });
  it("does not add an event for an unchanged edit", () => {
    expect(auditPaymentChange(payment, payment)).toBeNull();
  });
  it("records a restored payment or expense as a new event", () => {
    const restoredPayment = auditPaymentRestore(payment, "c1");
    const restoredExpense = auditExpenseRestore({ id: "e1", amount: 25, date: "2026-10-01", category: "تنقل", createdAt: "2026-10-01" });
    expect(restoredPayment).toMatchObject({ action: "restored", before: undefined, after: { amount: 100 }, reason: "استعادة من سلة المحذوفات" });
    expect(restoredExpense).toMatchObject({ action: "restored", before: undefined, after: { amount: 25 }, reason: "استعادة من سلة المحذوفات" });
  });
});
