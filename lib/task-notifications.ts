import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { cancelScheduledReminders } from "./notifications";
import type { OfficeTask } from "./models";

type TaskReminderFailure = Error & { orphanReminderIds?: string[] };

export async function scheduleTaskDeadline(task: OfficeTask): Promise<{ ids: string[]; enabled: boolean }> {
  if (Platform.OS === "web" || task.status === "done") return { ids: [], enabled: false };

  const dueAt = new Date(`${task.dueDate}T09:00:00`);
  if (Number.isNaN(dueAt.getTime())) return { ids: [], enabled: true };

  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) return { ids: [], enabled: false };

  const now = Date.now();
  const today = new Date();
  const todayLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const times: { at: Date; overdue: boolean }[] = [];
  if (task.dueDate > todayLocal) {
    times.push({ at: dueAt, overdue: false });
    const overdueAt = new Date(dueAt);
    overdueAt.setDate(overdueAt.getDate() + 1);
    times.push({ at: overdueAt, overdue: true });
  } else if (task.dueDate === todayLocal) {
    if (dueAt.getTime() > now) times.push({ at: dueAt, overdue: false });
    const overdueAt = new Date(dueAt);
    overdueAt.setDate(overdueAt.getDate() + 1);
    times.push({ at: overdueAt, overdue: true });
  } else {
    // A past-due task receives one immediate generic notice when created or rescheduled.
    times.push({ at: new Date(now + 5_000), overdue: true });
  }

  const ids: string[] = [];
  try {
    for (const time of times) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: time.overdue ? "متابعة مهمة متأخرة" : "تذكير بموعد إجراء",
          body: time.overdue ? "بقي إجراء مفتوح بعد موعد استحقاقه. افتح ميزان لمراجعته." : "يوجد إجراء مستحق اليوم. افتح ميزان لمراجعته.",
          sound: true,
          data: { taskId: task.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: time.at },
      });
      ids.push(id);
    }
    return { ids, enabled: true };
  } catch (error) {
    const orphanReminderIds = await cancelScheduledReminders(ids);
    if (orphanReminderIds.length) {
      const failure = (error instanceof Error ? error : new Error("تعذر جدولة تذكير المهمة")) as TaskReminderFailure;
      failure.orphanReminderIds = orphanReminderIds;
      throw failure;
    }
    throw error;
  }
}

export async function cancelTaskReminders(task: OfficeTask): Promise<string[]> {
  return cancelScheduledReminders(task.reminderIds ?? []);
}
