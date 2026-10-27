import { createId, type AppData, type FinancialAuditEntry, type FinancialAuditKind, type FinancialAuditSnapshot, type OfficeExpense, type Payment } from "./models";

function paymentSnapshot(payment: Payment): FinancialAuditSnapshot {
  return { amount: payment.amount, date: payment.date, paymentKind: payment.kind, caseId: payment.caseId, method: payment.method, note: payment.note };
}

function expenseSnapshot(expense: OfficeExpense): FinancialAuditSnapshot {
  return { amount: expense.amount, date: expense.date, caseId: expense.caseId, clientId: expense.clientId, note: expense.note, category: expense.category };
}

function createEntry(kind: FinancialAuditKind, recordId: string, caseId: string | undefined, clientId: string | undefined, before: FinancialAuditSnapshot | undefined, after: FinancialAuditSnapshot | undefined, reason?: string): FinancialAuditEntry | null {
  if (!before && !after) return null;
  if (before && after && JSON.stringify(before) === JSON.stringify(after)) return null;
  return {
    id: createId("audit"),
    recordId,
    kind,
    action: before ? after ? "corrected" : "voided" : "created",
    caseId,
    clientId,
    before,
    after,
    reason: reason?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
}

export function auditPaymentChange(before: Payment | undefined, after: Payment | undefined, clientId?: string, reason?: string): FinancialAuditEntry | null {
  const record = after ?? before;
  if (!record) return null;
  return createEntry("payment", record.id, record.caseId, clientId, before ? paymentSnapshot(before) : undefined, after ? paymentSnapshot(after) : undefined, reason);
}

export function auditPaymentRestore(payment: Payment, clientId?: string): FinancialAuditEntry | null {
  const entry = auditPaymentChange(undefined, payment, clientId, "استعادة من سلة المحذوفات");
  return entry ? { ...entry, action: "restored" } : null;
}

export function auditExpenseChange(before: OfficeExpense | undefined, after: OfficeExpense | undefined, reason?: string): FinancialAuditEntry | null {
  const record = after ?? before;
  if (!record) return null;
  return createEntry("expense", record.id, record.caseId, record.clientId, before ? expenseSnapshot(before) : undefined, after ? expenseSnapshot(after) : undefined, reason);
}

export function auditExpenseRestore(expense: OfficeExpense): FinancialAuditEntry | null {
  const entry = auditExpenseChange(undefined, expense, "استعادة من سلة المحذوفات");
  return entry ? { ...entry, action: "restored" } : null;
}

export function auditAdvanceChange(before: FinancialAuditSnapshot | undefined, after: FinancialAuditSnapshot | undefined, recordId: string, caseId: string, clientId: string, reason?: string): FinancialAuditEntry | null {
  return createEntry("advance", recordId, caseId, clientId, before, after, reason);
}

export function addAuditEntry(data: AppData, entry: FinancialAuditEntry | null): AppData {
  return entry ? { ...data, financialAudit: [entry, ...data.financialAudit] } : data;
}

export function financialAuditActionLabel(action: FinancialAuditEntry["action"]): string {
  if (action === "created") return "تسجيل حركة";
  if (action === "corrected") return "تصحيح حركة";
  if (action === "restored") return "استعادة حركة";
  return "إلغاء حركة";
}

export function financialAuditKindLabel(kind: FinancialAuditKind): string {
  if (kind === "payment") return "دفعة";
  if (kind === "advance") return "سلفة";
  return "مصروف";
}
