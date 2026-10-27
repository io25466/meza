import type { AppData } from "./models";

export type CaseTimelineEvent = {
  id: string;
  type: "appointment" | "task" | "payment" | "power" | "file" | "expense" | "audit";
  title: string;
  detail: string;
  at: string;
};

export function buildCaseTimeline(data: AppData, caseId: string): CaseTimelineEvent[] {
  const legalCase = data.cases.find((item) => item.id === caseId);
  if (!legalCase) return [];
  const events: CaseTimelineEvent[] = [];
  for (const item of data.appointments.filter((row) => row.caseId === caseId)) events.push({ id: `appointment:${item.id}`, type: "appointment", title: item.kind === "hearing" ? "جلسة" : "اجتماع", detail: `${item.title} · ${item.date} ${item.time}${item.location ? ` · ${item.location}` : ""}`, at: `${item.date}T${item.time || "12:00"}:00` });
  for (const item of data.tasks.filter((row) => row.caseId === caseId)) events.push({ id: `task:${item.id}`, type: "task", title: item.title, detail: `${item.status === "done" ? "مكتملة" : item.status === "in_progress" ? "قيد العمل" : "لم تبدأ"} · استحقاق ${item.dueDate}`, at: `${item.dueDate}T12:00:00` });
  for (const item of data.payments.filter((row) => row.caseId === caseId)) events.push({ id: `payment:${item.id}`, type: "payment", title: item.kind === "advance" ? "سلفة مستلمة" : "دفعة مستلمة", detail: `${item.amount} · ${item.date}${item.method ? ` · ${item.method}` : ""}${item.note ? ` · ${item.note}` : ""}`, at: `${item.date}T12:00:00` });
  for (const item of data.powers.filter((row) => row.clientId === legalCase.clientId)) events.push({ id: `power:${item.id}`, type: "power", title: "وكالة مرتبطة بالموكل", detail: `رقم ${item.number} · ${item.date} · ${item.capacity}`, at: `${item.date}T12:00:00` });
  for (const item of data.files.filter((row) => row.caseId === caseId)) events.push({ id: `file:${item.id}`, type: "file", title: "مستند القضية", detail: item.title, at: item.createdAt });
  for (const item of data.expenses.filter((row) => row.caseId === caseId)) events.push({ id: `expense:${item.id}`, type: "expense", title: `مصروف · ${item.category}`, detail: `${item.amount} · ${item.date}${item.note ? ` · ${item.note}` : ""}`, at: `${item.date}T12:00:00` });
  for (const item of data.financialAudit.filter((row) => row.caseId === caseId)) events.push({ id: `audit:${item.id}`, type: "audit", title: `سجل مالي · ${item.action === "created" ? "تسجيل" : item.action === "corrected" ? "تصحيح" : item.action === "restored" ? "استعادة" : "إلغاء"}`, detail: `${item.kind} · ${item.reason ?? ""}`, at: item.createdAt });
  return events.sort((a, b) => b.at.localeCompare(a.at));
}
