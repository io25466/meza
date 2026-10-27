import type { AppData, VaultFile } from "./models";

export type CascadeResult = {
  data: AppData;
  encryptedFiles: VaultFile[];
  reminderIds: string[];
};

export function removeCaseCascade(data: AppData, caseId: string): CascadeResult {
  const appointments = data.appointments.filter((item) => item.caseId === caseId);
  const tasks = data.tasks.filter((item) => item.caseId === caseId);
  const encryptedFiles = data.files.filter((item) => item.caseId === caseId);
  return {
    data: {
      ...data,
      cases: data.cases.filter((item) => item.id !== caseId),
      payments: data.payments.filter((item) => item.caseId !== caseId),
      appointments: data.appointments.filter((item) => item.caseId !== caseId),
      tasks: data.tasks.filter((item) => item.caseId !== caseId),
      expenses: data.expenses.filter((item) => item.caseId !== caseId),
      files: data.files.filter((item) => item.caseId !== caseId),
    },
    encryptedFiles,
    reminderIds: [...appointments.flatMap((item) => item.reminders), ...tasks.flatMap((item) => item.reminderIds ?? [])],
  };
}

export function removeClientCascade(data: AppData, clientId: string): CascadeResult {
  const caseIds = new Set(data.cases.filter((item) => item.clientId === clientId).map((item) => item.id));
  const appointments = data.appointments.filter((item) => item.caseId && caseIds.has(item.caseId));
  const tasks = data.tasks.filter((item) => item.caseId && caseIds.has(item.caseId));
  const encryptedFiles = data.files.filter((item) => item.caseId && caseIds.has(item.caseId));
  return {
    data: {
      ...data,
      clients: data.clients.filter((item) => item.id !== clientId),
      cases: data.cases.filter((item) => item.clientId !== clientId),
      powers: data.powers.filter((item) => item.clientId !== clientId),
      payments: data.payments.filter((item) => !caseIds.has(item.caseId)),
      appointments: data.appointments.filter((item) => !item.caseId || !caseIds.has(item.caseId)),
      tasks: data.tasks.filter((item) => !item.caseId || !caseIds.has(item.caseId)),
      expenses: data.expenses.filter((item) => item.clientId !== clientId && (!item.caseId || !caseIds.has(item.caseId))),
      files: data.files.filter((item) => !item.caseId || !caseIds.has(item.caseId)),
    },
    encryptedFiles,
    reminderIds: [...appointments.flatMap((item) => item.reminders), ...tasks.flatMap((item) => item.reminderIds ?? [])],
  };
}
