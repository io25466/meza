import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/app-text";
import { Button, Card, EmptyState, Page, SectionTitle } from "@/components/ui";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { cancelScheduledReminders, prepareAppointmentReminderUpdate, todayISO } from "@/lib/notifications";
import { confirmDestructiveAction } from "@/lib/confirm";
import { restoreTrashItem, purgeTrashItem } from "@/lib/trash";
import { scheduleTaskDeadline } from "@/lib/task-notifications";
import { deleteEncryptedAttachment } from "@/lib/secure-vault";
import { addAuditEntry, auditExpenseRestore, auditPaymentRestore } from "@/lib/financial-audit";
import type { TrashItem } from "@/lib/models";

const kindName: Record<TrashItem["kind"], string> = {
  client: "موكل", case: "قضية", appointment: "موعد", power: "وكالة", payment: "دفعة", expense: "مصروف", task: "مهمة", template: "قالب", article: "مادة قانونية", lawSource: "مصدر قانون",
};

function datesForReminderPlan(snapshot: TrashItem["snapshot"]) {
  const appointments = snapshot.appointments ?? [];
  const tasks = snapshot.tasks ?? [];
  return { appointments, tasks };
}

export default function TrashScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, updateData } = useAppData();
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  async function restore(item: TrashItem) {
    const yes = await confirmDestructiveAction("استعادة السجل؟", `ستعود «${item.title}» من سلة المحذوفات مع سجلاته وارتباطاته. لن تُنشأ نسخة مكررة.`);
    if (!yes) return;
    setBusyId(item.id); setNotice("");
    const newReminderIds: string[] = [];
    try {
      let restored = restoreTrashItem(data, item.id);
      if (item.kind === "payment") {
        const payment = item.snapshot.payments?.[0];
        if (payment) restored = addAuditEntry(restored, auditPaymentRestore(payment, data.cases.find((row) => row.id === payment.caseId)?.clientId));
      } else if (item.kind === "expense") {
        const expense = item.snapshot.expenses?.[0];
        if (expense) restored = addAuditEntry(restored, auditExpenseRestore(expense));
      }
      const { appointments, tasks } = datesForReminderPlan(item.snapshot);
      const plan = await prepareAppointmentReminderUpdate(appointments, {
        reminder24hEnabled: data.reminder24hEnabled,
        reminder1hEnabled: data.reminder1hEnabled,
      });
      newReminderIds.push(...plan.newIds, ...plan.orphanIds);
      const finalAppointments = plan.appointments.map((appointment) => ({
        ...appointment,
        reminders: appointment.reminders.filter((id) => plan.newIds.includes(id) || plan.orphanIds.includes(id)),
      }));
      const appointmentIds = new Set(finalAppointments.map((row) => row.id));
      restored = { ...restored, appointments: [...restored.appointments.filter((row) => !appointmentIds.has(row.id)), ...finalAppointments] };
      const restoredTasks = [];
      const today = todayISO();
      for (const task of tasks) {
        if (task.status === "done" || task.dueDate < today) { restoredTasks.push({ ...task, reminderIds: [] }); continue; }
        try {
          const result = await scheduleTaskDeadline(task);
          newReminderIds.push(...result.ids);
          restoredTasks.push({ ...task, reminderIds: result.ids });
        } catch (error) {
          const orphan = (error as Error & { orphanReminderIds?: string[] }).orphanReminderIds ?? [];
          newReminderIds.push(...orphan); restoredTasks.push({ ...task, reminderIds: orphan });
        }
      }
      const taskIds = new Set(restoredTasks.map((row) => row.id));
      restored = { ...restored, tasks: [...restored.tasks.filter((row) => !taskIds.has(row.id)), ...restoredTasks] };
      const oldIds = [...appointments.flatMap((row) => row.reminders), ...tasks.flatMap((row) => row.reminderIds ?? [])];
      restored = { ...restored, orphanReminderIds: [...new Set([...(restored.orphanReminderIds ?? []), ...oldIds])] };
      try {
        await updateData(() => restored);
      } catch (error) {
        await cancelScheduledReminders(newReminderIds);
        throw error;
      }
      const failedOld = await cancelScheduledReminders(oldIds);
      await updateData((current) => ({ ...current, orphanReminderIds: [...new Set([...(current.orphanReminderIds ?? []).filter((id) => !oldIds.includes(id)), ...failedOld])] })).catch(() => undefined);
      setNotice(`استُعيد ${kindName[item.kind]} «${item.title}».`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذرت الاستعادة؛ بقي السجل في سلة المحذوفات.");
    } finally { setBusyId(""); }
  }

  async function permanentlyDelete(item: TrashItem) {
    const yes = await confirmDestructiveAction("حذف نهائي؟", `سيُحذف «${item.title}» نهائياً من الجهاز، ولا يمكن استعادته. تأكد من وجود نسخة احتياطية إن كنت تحتاجه.`);
    if (!yes) return;
    setBusyId(item.id); setNotice("");
    try {
      const result = purgeTrashItem(data, item.id);
      const oldIds = [...(item.snapshot.appointments ?? []).flatMap((row) => row.reminders), ...(item.snapshot.tasks ?? []).flatMap((row) => row.reminderIds ?? [])];
      await updateData(() => ({ ...result.data, orphanReminderIds: [...new Set([...(data.orphanReminderIds ?? []), ...oldIds])] }));
      const failed = await cancelScheduledReminders(oldIds);
      if (failed.length) await updateData((current) => ({ ...current, orphanReminderIds: [...new Set([...(current.orphanReminderIds ?? []), ...failed])] })).catch(() => undefined);
      await Promise.all(result.filesToDelete.map((file) => deleteEncryptedAttachment(file.encryptedFile).catch(() => undefined)));
      setNotice(`حُذف «${item.title}» نهائياً.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "تعذر الحذف النهائي."); }
    finally { setBusyId(""); }
  }

  return <Page><ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 15 }}>
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}><Pressable onPress={() => router.back()} accessibilityLabel="رجوع" style={{ width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}><MaterialCommunityIcons name="arrow-right" size={21} color={colors.text} /></Pressable><View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>سلة المحذوفات</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }}>{data.trash.length} عنصر محفوظ محلياً للاستعادة</Text></View></View>
    <Card><SectionTitle title="ما الذي يحدث هنا؟" /><Text style={{ color: colors.muted, textAlign: "right", lineHeight: 21, fontSize: 12 }}>الحذف العادي لا يمحو المستندات المشفرة؛ ينقل السجل وعلاقاته إلى هنا. يمكن استعادته، أو حذفه نهائياً بإجراء مستقل.</Text></Card>
    {notice ? <Card style={{ borderColor: colors.tint }}><Text style={{ color: colors.text, textAlign: "right", lineHeight: 21 }}>{notice}</Text></Card> : null}
    {data.trash.length ? data.trash.map((item) => <Card key={item.id}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}><View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors.warning}18`, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name="delete-clock-outline" size={20} color={colors.warning} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "800" }}>{item.title}</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 3, fontSize: 11 }}>{kindName[item.kind]} · حُذف {new Date(item.deletedAt).toLocaleDateString("ar-SY")}</Text></View></View>
      <View style={{ flexDirection: "row-reverse", gap: 8, marginTop: 13 }}><View style={{ flex: 1 }}><Button title={busyId === item.id ? "جارٍ المعالجة…" : "استعادة"} onPress={() => void restore(item)} disabled={!!busyId} secondary icon={<MaterialCommunityIcons name="restore" size={17} color={colors.text} />} /></View><View style={{ flex: 1 }}><Button title="حذف نهائي" onPress={() => void permanentlyDelete(item)} disabled={!!busyId} icon={<MaterialCommunityIcons name="delete-forever-outline" size={17} color="#fff" />} /></View></View>
    </Card>) : <Card><EmptyState icon={<MaterialCommunityIcons name="delete-empty-outline" size={25} color={colors.muted} />} title="سلة المحذوفات فارغة" detail="السجلات المحذوفة حديثاً ستظهر هنا للاستعادة أو الحذف النهائي." /></Card>}
  </ScrollView></Page>;
}
