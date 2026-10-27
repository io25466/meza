import { describe, expect, it } from "vitest";
import { EMPTY_DATA } from "./models";
import { removeCaseCascade, removeClientCascade } from "./record-cascade";

const sample = {
  ...EMPTY_DATA,
  clients: [
    { id: "c1", name: "ليلى", phone: "", createdAt: "2026-01-01" },
    { id: "c2", name: "نورة", phone: "", createdAt: "2026-01-01" },
  ],
  cases: [
    { id: "case1", clientId: "c1", title: "أ", type: "مدني", status: "قائمة", totalFees: 100, advancePayment: 10, createdAt: "2026-01-01" },
    { id: "case2", clientId: "c2", title: "ب", type: "مدني", status: "قائمة", totalFees: 100, advancePayment: 0, createdAt: "2026-01-01" },
  ],
  payments: [{ id: "p1", caseId: "case1", amount: 5, date: "2026-01-02", kind: "installment" as const }],
  appointments: [{ id: "a1", caseId: "case1", title: "جلسة", kind: "hearing" as const, date: "2026-02-01", time: "09:00", reminders: ["r1"] }],
  tasks: [{ id: "t1", caseId: "case1", title: "تبليغ", dueDate: "2026-02-02", status: "pending" as const, reminderIds: ["r2"], createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
  expenses: [{ id: "e1", amount: 10, date: "2026-01-03", category: "رسوم", caseId: "case1", createdAt: "2026-01-03" }],
  files: [{ id: "f1", title: "مذكرة.pdf", mimeType: "application/pdf", encryptedFile: "cipher", caseId: "case1", createdAt: "2026-01-01" }],
};

describe("record deletion cascade", () => {
  it("removes the selected case and its financial, task, appointment and file records", () => {
    const result = removeCaseCascade(sample, "case1");
    expect(result.data.cases.map((item) => item.id)).toEqual(["case2"]);
    expect(result.data.payments).toEqual([]);
    expect(result.data.appointments).toEqual([]);
    expect(result.data.tasks).toEqual([]);
    expect(result.data.expenses).toEqual([]);
    expect(result.reminderIds).toEqual(["r1", "r2"]);
    expect(result.encryptedFiles.map((file) => file.id)).toEqual(["f1"]);
  });

  it("removes only one client's records and keeps other client data", () => {
    const result = removeClientCascade(sample, "c1");
    expect(result.data.clients.map((item) => item.id)).toEqual(["c2"]);
    expect(result.data.cases.map((item) => item.id)).toEqual(["case2"]);
    expect(result.data.payments).toEqual([]);
    expect(result.data.files).toEqual([]);
    expect(result.reminderIds).toEqual(["r1", "r2"]);
  });
});
