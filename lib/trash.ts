import { createId, type AppData, type TrashItem, type TrashKind, type TrashSnapshot, type VaultFile } from "./models";

export type TrashMoveResult = { data: AppData; item: TrashItem; reminderIds: string[] };

const includesId = <T extends { id: string }>(rows: T[], id: string) => rows.filter((row) => row.id === id);
const excludesId = <T extends { id: string }>(rows: T[], id: string) => rows.filter((row) => row.id !== id);

export function moveRecordToTrash(data: AppData, kind: TrashKind, recordId: string, now = new Date().toISOString()): TrashMoveResult {
  let title = "سجل";
  let snapshot: TrashSnapshot = {};
  let next: AppData = data;
  let reminderIds: string[] = [];

  if (kind === "client") {
    const client = data.clients.find((row) => row.id === recordId);
    if (!client) throw new Error("ملف الموكل غير موجود.");
    const cases = data.cases.filter((row) => row.clientId === recordId);
    const caseIds = new Set(cases.map((row) => row.id));
    const appointments = data.appointments.filter((row) => row.caseId && caseIds.has(row.caseId));
    const tasks = data.tasks.filter((row) => row.caseId && caseIds.has(row.caseId));
    const powers = data.powers.filter((row) => row.clientId === recordId);
    const powerFileIds = new Set(powers.flatMap((row) => row.fileId ? [row.fileId] : []));
    const files = data.files.filter((row) => row.clientId === recordId || (row.caseId && caseIds.has(row.caseId)) || powerFileIds.has(row.id));
    const payments = data.payments.filter((row) => caseIds.has(row.caseId));
    const expenses = data.expenses.filter((row) => row.clientId === recordId || (row.caseId && caseIds.has(row.caseId)));
    const financialAudit = data.financialAudit.filter((row) => row.clientId === recordId || (row.caseId && caseIds.has(row.caseId)));
    snapshot = { clients: [client], cases, payments, appointments, powers, files, tasks, expenses, financialAudit };
    title = client.name;
    reminderIds = [...appointments.flatMap((row) => row.reminders), ...tasks.flatMap((row) => row.reminderIds ?? [])];
    next = { ...data, clients: excludesId(data.clients, recordId), cases: data.cases.filter((row) => !caseIds.has(row.id)), payments: data.payments.filter((row) => !caseIds.has(row.caseId)), appointments: data.appointments.filter((row) => !row.caseId || !caseIds.has(row.caseId)), powers: data.powers.filter((row) => row.clientId !== recordId), files: data.files.filter((row) => row.clientId !== recordId && (!row.caseId || !caseIds.has(row.caseId)) && !powerFileIds.has(row.id)), tasks: data.tasks.filter((row) => !row.caseId || !caseIds.has(row.caseId)), expenses: data.expenses.filter((row) => row.clientId !== recordId && (!row.caseId || !caseIds.has(row.caseId))), financialAudit: data.financialAudit.filter((row) => row.clientId !== recordId && (!row.caseId || !caseIds.has(row.caseId))) };
  } else if (kind === "case") {
    const legalCase = data.cases.find((row) => row.id === recordId);
    if (!legalCase) throw new Error("القضية غير موجودة.");
    const appointments = data.appointments.filter((row) => row.caseId === recordId);
    const tasks = data.tasks.filter((row) => row.caseId === recordId);
    const files = data.files.filter((row) => row.caseId === recordId);
    const payments = data.payments.filter((row) => row.caseId === recordId);
    snapshot = { cases: [legalCase], payments, appointments, tasks, files, expenses: data.expenses.filter((row) => row.caseId === recordId), financialAudit: data.financialAudit.filter((row) => row.caseId === recordId) };
    title = legalCase.title;
    reminderIds = [...appointments.flatMap((row) => row.reminders), ...tasks.flatMap((row) => row.reminderIds ?? [])];
    next = { ...data, cases: excludesId(data.cases, recordId), payments: data.payments.filter((row) => row.caseId !== recordId), appointments: data.appointments.filter((row) => row.caseId !== recordId), tasks: data.tasks.filter((row) => row.caseId !== recordId), expenses: data.expenses.filter((row) => row.caseId !== recordId), files: data.files.filter((row) => row.caseId !== recordId), financialAudit: data.financialAudit.filter((row) => row.caseId !== recordId) };
  } else if (kind === "appointment") {
    const row = data.appointments.find((item) => item.id === recordId);
    if (!row) throw new Error("الموعد غير موجود.");
    snapshot = { appointments: [row] }; title = row.title; reminderIds = row.reminders;
    next = { ...data, appointments: excludesId(data.appointments, recordId) };
  } else if (kind === "power") {
    const row = data.powers.find((item) => item.id === recordId);
    if (!row) throw new Error("الوكالة غير موجودة.");
    snapshot = { powers: [row] }; title = `وكالة ${row.number}`;
    next = { ...data, powers: excludesId(data.powers, recordId) };
  } else if (kind === "payment") {
    const row = data.payments.find((item) => item.id === recordId);
    if (!row) throw new Error("الدفعة غير موجودة.");
    snapshot = { payments: [row] }; title = `دفعة ${row.amount}`;
    next = { ...data, payments: excludesId(data.payments, recordId) };
  } else if (kind === "expense") {
    const row = data.expenses.find((item) => item.id === recordId);
    if (!row) throw new Error("المصروف غير موجود.");
    snapshot = { expenses: [row] }; title = `مصروف ${row.category}`;
    next = { ...data, expenses: excludesId(data.expenses, recordId) };
  } else if (kind === "task") {
    const row = data.tasks.find((item) => item.id === recordId);
    if (!row) throw new Error("المهمة غير موجودة.");
    snapshot = { tasks: [row] }; title = row.title; reminderIds = row.reminderIds ?? [];
    next = { ...data, tasks: excludesId(data.tasks, recordId) };
  } else if (kind === "template") {
    const row = data.templates.find((item) => item.id === recordId);
    if (!row) throw new Error("القالب غير موجود.");
    snapshot = { templates: [row] }; title = row.title;
    next = { ...data, templates: excludesId(data.templates, recordId) };
  } else if (kind === "article") {
    const row = data.articles.find((item) => item.id === recordId);
    if (!row) throw new Error("المادة غير موجودة.");
    snapshot = { articles: [row] }; title = `${row.title} — المادة ${row.number}`;
    next = { ...data, articles: excludesId(data.articles, recordId) };
  } else {
    const row = data.lawSources.find((item) => item.id === recordId);
    if (!row) throw new Error("مصدر القانون غير موجود.");
    const files = data.files.filter((file) => file.id === row.fileId);
    const articles = data.articles.filter((article) => article.sourceId === row.id);
    snapshot = { lawSources: [row], files, articles }; title = row.title;
    next = { ...data, lawSources: excludesId(data.lawSources, recordId), files: data.files.filter((file) => file.id !== row.fileId), articles: data.articles.filter((article) => article.sourceId !== row.id) };
  }

  const item: TrashItem = { id: createId("trash"), kind, title, deletedAt: now, snapshot };
  return { data: { ...next, trash: [item, ...data.trash] }, item, reminderIds };
}

function rowsFor(snapshot: TrashSnapshot, key: keyof TrashSnapshot): { id: string }[] {
  return (snapshot[key] as { id: string }[] | undefined) ?? [];
}

export function restoreTrashItem(data: AppData, trashId: string): AppData {
  const item = data.trash.find((row) => row.id === trashId);
  if (!item) throw new Error("لم يُعثر على العنصر في سلة المحذوفات.");
  const snapshot = item.snapshot;
  const restoringClients = rowsFor(snapshot, "clients");
  const restoringCases = rowsFor(snapshot, "cases");
  const availableClients = new Set([...data.clients.map((row) => row.id), ...restoringClients.map((row) => row.id)]);
  const availableCases = new Set([...data.cases.map((row) => row.id), ...restoringCases.map((row) => row.id)]);
  for (const row of restoringCases as AppData["cases"]) if (!availableClients.has(row.clientId)) throw new Error("يجب استعادة ملف الموكل قبل هذه القضية.");
  for (const row of rowsFor(snapshot, "payments") as AppData["payments"]) if (!availableCases.has(row.caseId)) throw new Error("يجب استعادة القضية قبل دفعاتها.");
  for (const row of rowsFor(snapshot, "appointments") as AppData["appointments"]) if (row.caseId && !availableCases.has(row.caseId)) throw new Error("يجب استعادة القضية قبل مواعيدها.");
  for (const row of rowsFor(snapshot, "tasks") as AppData["tasks"]) if (row.caseId && !availableCases.has(row.caseId)) throw new Error("يجب استعادة القضية قبل مهامها.");
  for (const row of rowsFor(snapshot, "powers") as AppData["powers"]) if (!availableClients.has(row.clientId)) throw new Error("يجب استعادة الموكل قبل وكالته.");
  for (const row of rowsFor(snapshot, "expenses") as AppData["expenses"]) {
    if (row.caseId && !availableCases.has(row.caseId)) throw new Error("يجب استعادة القضية قبل مصروفاتها.");
    if (row.clientId && !availableClients.has(row.clientId)) throw new Error("يجب استعادة الموكل قبل مصروفاته.");
  }
  const availableSources = new Set([...data.lawSources.map((row) => row.id), ...rowsFor(snapshot, "lawSources").map((row) => row.id)]);
  for (const row of rowsFor(snapshot, "articles") as AppData["articles"]) if (row.sourceId && !availableSources.has(row.sourceId)) throw new Error("يجب استعادة مصدر القانون قبل مواده.");

  const keys: (keyof TrashSnapshot)[] = ["clients", "cases", "payments", "appointments", "powers", "files", "articles", "lawSources", "tasks", "templates", "expenses", "financialAudit"];
  let merged = { ...data };
  for (const key of keys) {
    const current = (merged[key] as { id: string }[]) ?? [];
    const incoming = rowsFor(snapshot, key);
    const existingIds = new Set(current.map((row) => row.id));
    if (incoming.some((row) => existingIds.has(row.id))) throw new Error("يوجد سجل بالمعرّف نفسه؛ لم تُستعد نسخة مكررة.");
    (merged as unknown as Record<string, unknown>)[key] = [...current, ...incoming];
  }
  merged.trash = data.trash.filter((row) => row.id !== trashId);
  return merged;
}

function hasTrashDependents(parent: TrashItem, candidate: TrashItem): boolean {
  const clientIds = new Set((parent.snapshot.clients ?? []).map((row) => row.id));
  const caseIds = new Set((parent.snapshot.cases ?? []).map((row) => row.id));
  const sourceIds = new Set((parent.snapshot.lawSources ?? []).map((row) => row.id));
  if (!clientIds.size && !caseIds.size && !sourceIds.size) return false;
  const snapshot = candidate.snapshot;
  return (snapshot.cases ?? []).some((row) => clientIds.has(row.clientId))
    || (snapshot.powers ?? []).some((row) => clientIds.has(row.clientId))
    || (snapshot.payments ?? []).some((row) => caseIds.has(row.caseId))
    || (snapshot.appointments ?? []).some((row) => !!row.caseId && caseIds.has(row.caseId))
    || (snapshot.tasks ?? []).some((row) => !!row.caseId && caseIds.has(row.caseId))
    || (snapshot.files ?? []).some((row) => (!!row.clientId && clientIds.has(row.clientId)) || (!!row.caseId && caseIds.has(row.caseId)))
    || (snapshot.expenses ?? []).some((row) => (!!row.clientId && clientIds.has(row.clientId)) || (!!row.caseId && caseIds.has(row.caseId)))
    || (snapshot.financialAudit ?? []).some((row) => (!!row.clientId && clientIds.has(row.clientId)) || (!!row.caseId && caseIds.has(row.caseId)))
    || (snapshot.articles ?? []).some((row) => !!row.sourceId && sourceIds.has(row.sourceId));
}

export function purgeTrashItem(data: AppData, trashId: string): { data: AppData; filesToDelete: VaultFile[] } {
  const item = data.trash.find((row) => row.id === trashId);
  if (!item) throw new Error("لم يُعثر على العنصر في سلة المحذوفات.");
  if (data.trash.some((candidate) => candidate.id !== trashId && hasTrashDependents(item, candidate))) {
    throw new Error("لا يمكن الحذف النهائي؛ توجد سجلات تابعة منفصلة في السلة. استعدها أو احذفها نهائياً أولاً.");
  }
  const trash = data.trash.filter((row) => row.id !== trashId);
  const remainingFileIds = new Set([
    ...data.files.map((file) => file.id),
    ...trash.flatMap((row) => row.snapshot.files ?? []).map((file) => file.id),
  ]);
  const filesToDelete = (item.snapshot.files ?? []).filter((file) => !remainingFileIds.has(file.id));
  return { data: { ...data, trash }, filesToDelete };
}
