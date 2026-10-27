import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Appointment } from "./models";
import { appointmentReminderMessage } from "./notification-copy";

export type ReminderPreferences = {
  reminder24hEnabled?: boolean;
  reminder1hEnabled?: boolean;
};

export type PreparedReminderUpdate = {
  appointments: Appointment[];
  oldIds: string[];
  newIds: string[];
  orphanIds: string[];
  enabled: boolean;
  reason?: "permission" | "schedule";
};

type ScheduledFailure = Error & { appointmentId?: string; orphanReminderIds?: string[] };

export async function scheduleAppointmentReminders(
  appointment: Appointment,
  preferences: ReminderPreferences = {},
): Promise<{ ids: string[]; enabled: boolean }> {
  if (Platform.OS === "web") return { ids: [], enabled: false };
  const offsets = [
    preferences.reminder24hEnabled === false ? null : 24 * 60 * 60 * 1000,
    preferences.reminder1hEnabled === false ? null : 60 * 60 * 1000,
  ].filter((offset): offset is number => offset !== null);
  if (offsets.length === 0) return { ids: [], enabled: true };
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return { ids: [], enabled: false };
  const appointmentAt = new Date(`${appointment.date}T${appointment.time}:00`);
  const ids: string[] = [];
  try {
    for (const offset of offsets) {
      const remindAt = new Date(appointmentAt.getTime() - offset);
      if (remindAt.getTime() <= Date.now()) continue;
      const id = await Notifications.scheduleNotificationAsync({
        content: { ...appointmentReminderMessage(appointment.kind, offset), sound: true, data: { appointmentId: appointment.id } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: remindAt },
      });
      ids.push(id);
    }
    return { ids, enabled: true };
  } catch (error) {
    const orphanReminderIds = await cancelScheduledReminders(ids);
    if (orphanReminderIds.length) {
      const failure = error instanceof Error ? error as ScheduledFailure : new Error("تعذر جدولة التذكيرات") as ScheduledFailure;
      failure.appointmentId = appointment.id;
      failure.orphanReminderIds = orphanReminderIds;
      throw failure;
    }
    throw error;
  }
}

/** Schedule replacements first; old IDs remain tracked until the caller persists and commits the replacements. */
export async function prepareAppointmentReminderUpdate(
  appointments: Appointment[],
  preferences: ReminderPreferences,
): Promise<PreparedReminderUpdate> {
  const staged: Appointment[] = [];
  const oldIds: string[] = [];
  const newIds: string[] = [];
  const newlyScheduled: { appointmentId: string; id: string }[] = [];

  for (const appointment of appointments) {
    let result: { ids: string[]; enabled: boolean };
    try {
      result = await scheduleAppointmentReminders(appointment, preferences);
    } catch (error) {
      const rollbackFailures = await cancelScheduledReminders(newIds);
      const records = newlyScheduled.filter(({ id }) => rollbackFailures.includes(id));
      const scheduleFailure = error as ScheduledFailure;
      records.push(...(scheduleFailure.orphanReminderIds ?? []).map((id) => ({ appointmentId: scheduleFailure.appointmentId ?? appointment.id, id })));
      const orphanIds = records.map(({ id }) => id);
      return { appointments: retainFailedIds(appointments, records), oldIds: [], newIds: [], orphanIds, enabled: false, reason: "schedule" };
    }

    if (!result.enabled) {
      const rollbackFailures = await cancelScheduledReminders(newIds);
      const records = newlyScheduled.filter(({ id }) => rollbackFailures.includes(id));
      const orphanIds = records.map(({ id }) => id);
      return { appointments: retainFailedIds(appointments, records), oldIds: [], newIds: [], orphanIds, enabled: false, reason: "permission" };
    }

    oldIds.push(...appointment.reminders);
    newIds.push(...result.ids);
    newlyScheduled.push(...result.ids.map((id) => ({ appointmentId: appointment.id, id })));
    staged.push({ ...appointment, reminders: [...result.ids, ...appointment.reminders] });
  }

  return { appointments: staged, oldIds, newIds, orphanIds: [], enabled: true };
}

function retainFailedIds(appointments: Appointment[], failed: { appointmentId: string; id: string }[]): Appointment[] {
  return appointments.map((appointment) => {
    const ids = failed.filter((item) => item.appointmentId === appointment.id).map((item) => item.id);
    return ids.length ? { ...appointment, reminders: [...new Set([...appointment.reminders, ...ids])] } : appointment;
  });
}

/** Returns IDs that could not be cancelled after one retry so the caller can keep them for later cleanup. */
export async function cancelScheduledReminders(ids: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const id of ids) {
    try { await Notifications.cancelScheduledNotificationAsync(id); }
    catch {
      try { await Notifications.cancelScheduledNotificationAsync(id); }
      catch { failed.push(id); }
    }
  }
  return failed;
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
