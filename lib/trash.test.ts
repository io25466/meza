import { describe, expect, it } from "vitest";
import { EMPTY_DATA, type AppData } from "./models";
import { moveRecordToTrash, purgeTrashItem, restoreTrashItem } from "./trash";

const seed: AppData = {
  ...EMPTY_DATA,
  clients: [{ id: "c1", name: "موكل", phone: "", createdAt: "2026-01-01" }],
  cases: [{ id: "k1", clientId: "c1", title: "قضية", type: "مدني", status: "قائمة", totalFees: 100, advancePayment: 0, createdAt: "2026-01-01" }],
  appointments: [{ id: "a1", caseId: "k1", title: "جلسة", kind: "hearing", date: "2026-10-20", time: "09:00", reminders: ["notice-a"] }],
  files: [{ id: "f1", caseId: "k1", title: "مستند", mimeType: "application/pdf", encryptedFile: "/private/file.enc", createdAt: "2026-01-01" }],
};

describe("recoverable record trash", () => {
  it("moves a case and its child records aside without deleting its encrypted file", () => {
    const moved = moveRecordToTrash(seed, "case", "k1", "2026-10-19T12:00:00Z");
    expect(moved.data.cases).toHaveLength(0);
    expect(moved.data.appointments).toHaveLength(0);
    expect(moved.data.files).toHaveLength(0);
    expect(moved.data.trash[0]?.snapshot.files?.[0]?.encryptedFile).toBe("/private/file.enc");
    expect(moved.reminderIds).toEqual(["notice-a"]);
  });
  it("restores the original IDs and linkage", () => {
    const moved = moveRecordToTrash(seed, "case", "k1");
    const restored = restoreTrashItem(moved.data, moved.item.id);
    expect(restored.cases.map((row) => row.id)).toEqual(["k1"]);
    expect(restored.files[0]?.caseId).toBe("k1");
    expect(restored.trash).toHaveLength(0);
  });
  it("requires parents before restoring a detached case and purges only unreferenced files", () => {
    const moved = moveRecordToTrash(seed, "client", "c1");
    expect(() => restoreTrashItem({ ...moved.data, clients: [] }, "missing")).toThrow();
    const purged = purgeTrashItem(moved.data, moved.item.id);
    expect(purged.filesToDelete.map((file) => file.id)).toContain("f1");
  });
  it("restores a client, case, agency and its linked encrypted file together", () => {
    const complete = {
      ...seed,
      powers: [{ id: "poa1", clientId: "c1", number: "22", date: "2026-02-01", capacity: "وكيل", fileId: "f2" }],
      files: [...seed.files, { id: "f2", title: "وكالة.pdf", mimeType: "application/pdf", encryptedFile: "/private/poa.enc", createdAt: "2026-01-02" }],
    };
    const moved = moveRecordToTrash(complete, "client", "c1");
    expect(moved.data.files).toHaveLength(0);
    const restored = restoreTrashItem(moved.data, moved.item.id);
    expect(restored.powers[0]?.fileId).toBe("f2");
    expect(restored.files.map((file) => file.id)).toEqual(["f1", "f2"]);
    expect(restored.cases[0]?.clientId).toBe("c1");
  });
  it("blocks permanently purging a case while a separately archived payment depends on it", () => {
    const withPayment = { ...seed, payments: [{ id: "p1", caseId: "k1", amount: 10, date: "2026-10-01", kind: "installment" as const }] };
    const paymentInTrash = moveRecordToTrash(withPayment, "payment", "p1");
    const caseInTrash = moveRecordToTrash(paymentInTrash.data, "case", "k1");
    expect(() => purgeTrashItem(caseInTrash.data, caseInTrash.item.id)).toThrow("سجلات تابعة");
  });
});
