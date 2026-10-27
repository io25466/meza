import { remainingBalance, type AppData } from "./models";

export type ClientFinancialSummary = {
  clientId: string | null;
  clientName: string;
  receipts: number;
  outstanding: number;
  expenses: number;
};

export type MonthlyFinancialReport = {
  month: string;
  receipts: number;
  outstanding: number;
  expenses: number;
  estimatedLegacyAdvances: number;
  byClient: ClientFinancialSummary[];
};

export function monthlyFinancialReport(data: AppData, month: string): MonthlyFinancialReport {
  const byClient = new Map<string | null, ClientFinancialSummary>();
  const rowFor = (clientId: string | null): ClientFinancialSummary => {
    const found = byClient.get(clientId);
    if (found) return found;
    const row = {
      clientId,
      clientName: clientId ? data.clients.find((item) => item.id === clientId)?.name ?? "موكل غير موجود" : "غير مرتبط بموكل",
      receipts: 0,
      outstanding: 0,
      expenses: 0,
    };
    byClient.set(clientId, row);
    return row;
  };

  let receipts = 0;
  let estimatedLegacyAdvances = 0;
  const casesWithRecordedAdvance = new Set(data.payments.filter((payment) => payment.kind === "advance").map((payment) => payment.caseId));
  for (const payment of data.payments) {
    if (!payment.date.startsWith(month)) continue;
    const linkedCase = data.cases.find((item) => item.id === payment.caseId);
    const row = rowFor(linkedCase?.clientId ?? null);
    row.receipts += payment.amount;
    receipts += payment.amount;
  }

  for (const legalCase of data.cases) {
    const clientId = legalCase.clientId || null;
    const row = rowFor(clientId);
    row.outstanding += remainingBalance(legalCase, data.payments);
    if (legalCase.advancePayment <= 0 || casesWithRecordedAdvance.has(legalCase.id)) continue;
    const hasPaymentDate = !!legalCase.advancePaymentDate;
    const receivedOn = legalCase.advancePaymentDate ?? legalCase.createdAt.slice(0, 10);
    if (!receivedOn.startsWith(month)) continue;
    row.receipts += legalCase.advancePayment;
    receipts += legalCase.advancePayment;
    if (!hasPaymentDate) estimatedLegacyAdvances += legalCase.advancePayment;
  }

  let expenses = 0;
  for (const expense of data.expenses) {
    if (!expense.date.startsWith(month)) continue;
    const linkedCase = expense.caseId ? data.cases.find((item) => item.id === expense.caseId) : undefined;
    const clientId = expense.clientId ?? linkedCase?.clientId ?? null;
    const row = rowFor(clientId);
    row.expenses += expense.amount;
    expenses += expense.amount;
  }

  for (const client of data.clients) rowFor(client.id);
  return {
    month,
    receipts,
    outstanding: data.cases.reduce((sum, legalCase) => sum + remainingBalance(legalCase, data.payments), 0),
    expenses,
    estimatedLegacyAdvances,
    byClient: [...byClient.values()].sort((a, b) => (b.receipts + b.outstanding + b.expenses) - (a.receipts + a.outstanding + a.expenses)),
  };
}
