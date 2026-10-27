import { describe, expect, it } from "vitest";
import { EMPTY_DATA } from "./models";
import { searchAll } from "./search";

describe("Arabic universal search", () => {
  const data = {
    ...EMPTY_DATA,
    clients: [{ id: "client_1", name: "أمينة الدوسري", phone: "0500000000", createdAt: "2026-01-01" }],
    cases: [{ id: "case_1", clientId: "client_1", title: "مطالبة مالية", type: "مدني", status: "قائمة", caseNumber: "12345", court: "محكمة البداية المدنية", courtLevel: "بداية", governorate: "دمشق", totalFees: 0, advancePayment: 0, createdAt: "2026-01-01" }],
    powers: [{ id: "poa_1", clientId: "client_1", number: "وكالة-8765", date: "2026-01-01", capacity: "وكيل", agencyType: "special" as const }],
    appointments: [{ id: "apt_1", title: "جلسة نظر", kind: "hearing" as const, date: "2026-10-18", time: "10:00", reminders: [] }],
    articles: [{ id: "article_1", title: "نظام المعاملات", number: "12", specialty: "مدني", text: "الالتزام بحسن النية في تنفيذ العقد", favorite: false, createdAt: "2026-01-01" }],
    tasks: [{ id: "task_1", title: "تجهيز الملف", phase: "service_followup" as const, dueDate: "2026-10-20", status: "pending" as const, createdAt: "2026-10-18", updatedAt: "2026-10-18" }],
    templates: [{ id: "template_1", title: "مسودة دفاع", body: "{{client_name}} مذكرة", versions: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
  };

  it("normalizes Arabic letters for client-name matching", () => {
    expect(searchAll(data, "امينه").some((hit) => hit.type === "موكل")).toBe(true);
  });

  it("finds power-of-attorney numbers, appointment dates and law text", () => {
    expect(searchAll(data, "8765").some((hit) => hit.type === "وكالة")).toBe(true);
    expect(searchAll(data, "2026-01-01").some((hit) => hit.type === "وكالة")).toBe(true);
    expect(searchAll(data, "2026-10-18").some((hit) => hit.type === "موعد")).toBe(true);
    expect(searchAll(data, "حسن النية").some((hit) => hit.type === "مادة")).toBe(true);
    expect(searchAll(data, "خاص").some((hit) => hit.type === "وكالة")).toBe(true);
    expect(searchAll(data, "متابعة التبليغ").some((hit) => hit.type === "مهمة")).toBe(true);
    expect(searchAll(data, "مسودة دفاع").some((hit) => hit.type === "قالب")).toBe(true);
    expect(searchAll(data, "دمشق").some((hit) => hit.type === "قضية")).toBe(true);
    expect(searchAll(data, "بداية").some((hit) => hit.type === "قضية")).toBe(true);
  });
});
