import { normalizeArabic, type AppData } from "./models";

export type SearchHit = { type: "موكل" | "قضية" | "وكالة" | "موعد" | "مادة" | "مهمة" | "قالب"; title: string; subtitle: string; tab: string };

export function searchAll(data: AppData, rawQuery: string): SearchHit[] {
  const query = normalizeArabic(rawQuery);
  if (!query) return [];
  const hits: SearchHit[] = [];
  const includes = (...parts: string[]) => parts.some((part) => normalizeArabic(part).includes(query));

  for (const client of data.clients) {
    if (includes(client.name, client.phone)) hits.push({ type: "موكل", title: client.name, subtitle: client.phone || "موكل", tab: "clients" });
  }
  for (const legalCase of data.cases) {
    const client = data.clients.find((record) => record.id === legalCase.clientId);
    if (includes(legalCase.title, legalCase.type, legalCase.status, legalCase.caseNumber ?? "", legalCase.court ?? "", legalCase.courtLevel ?? "", legalCase.governorate ?? "", client?.name ?? "")) hits.push({ type: "قضية", title: legalCase.title, subtitle: `${client?.name ?? "موكل غير محدد"} · ${legalCase.status}`, tab: "clients" });
  }
  for (const power of data.powers) {
    const client = data.clients.find((record) => record.id === power.clientId);
    const agencyType = power.agencyType === "general" ? "عام" : power.agencyType === "special" ? "خاص" : power.agencyType === "sharia" ? "شرعي" : "";
    if (includes(power.number, power.capacity, power.date, agencyType, client?.name ?? "")) hits.push({ type: "وكالة", title: `وكالة رقم ${power.number}`, subtitle: `${agencyType || "نوع غير محدد"} · ${client?.name ?? "موكل"} · ${power.date}`, tab: "vault" });
  }
  for (const appointment of data.appointments) {
    if (includes(appointment.title, appointment.date, appointment.time, appointment.location ?? "")) hits.push({ type: "موعد", title: appointment.title, subtitle: `${appointment.date} · ${appointment.time}`, tab: "index" });
  }
  for (const article of data.articles) {
    if (includes(article.title, article.number, article.specialty, article.text, article.lawNumber ?? "", article.lawYear ?? "", article.sourceUrl ?? "")) hits.push({ type: "مادة", title: `${article.title} · م ${article.number}`, subtitle: article.text.slice(0, 88), tab: "library" });
  }
  for (const task of data.tasks) {
    const linkedCase = data.cases.find((item) => item.id === task.caseId);
    const taskPhase = task.phase === "hearing_preparation" ? "إعداد الجلسة" : task.phase === "service_followup" ? "متابعة التبليغ" : task.phase === "pleading_preparation" ? "تجهيز المرافعة" : "أخرى";
    if (includes(task.title, task.dueDate, taskPhase, linkedCase?.title ?? "")) hits.push({ type: "مهمة", title: task.title, subtitle: `${taskPhase} · ${task.dueDate}${linkedCase ? ` · ${linkedCase.title}` : ""}`, tab: "tasks" });
  }
  for (const template of data.templates) {
    if (includes(template.title, template.body)) hits.push({ type: "قالب", title: template.title, subtitle: template.body.slice(0, 88), tab: "templates" });
  }
  return hits.slice(0, 40);
}
