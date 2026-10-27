import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/components/app-text";
import { KeyboardAvoidingSheet } from "@/components/keyboard-avoiding-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { confirmDestructiveAction } from "@/lib/confirm";
import { cancelTaskReminders, scheduleTaskDeadline } from "@/lib/task-notifications";
import { moveRecordToTrash } from "@/lib/trash";
import { createId, isValidISODate, type OfficeTask, type TaskPhase, type TaskStatus } from "@/lib/models";
import { Button, Card, EmptyState, Field, Page, Pill, SectionTitle } from "@/components/ui";

type TaskFilter = "all" | "overdue" | "done" | TaskPhase;
type NotificationAttempt = { ids: string[]; enabled: boolean; failed: boolean };

const statusOptions: { id: TaskStatus; label: string }[] = [
  { id: "pending", label: "لم تبدأ" },
  { id: "in_progress", label: "قيد العمل" },
  { id: "done", label: "مكتملة" },
];
const phaseOptions: { id: TaskPhase; label: string }[] = [
  { id: "hearing_preparation", label: "إعداد الجلسة" },
  { id: "service_followup", label: "متابعة التبليغ" },
  { id: "pleading_preparation", label: "تجهيز المرافعة" },
  { id: "other", label: "أخرى" },
];

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

function isOverdue(task: OfficeTask) {
  return task.status !== "done" && isValidISODate(task.dueDate) && task.dueDate < todayISO();
}

function formatDate(date: string) {
  if (!isValidISODate(date)) return date;
  return new Date(`${date}T12:00:00`).toLocaleDateString("ar-SA", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function statusLabel(status: TaskStatus) {
  return statusOptions.find((item) => item.id === status)?.label ?? "لم تبدأ";
}

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === "pending") return "in_progress";
  if (status === "in_progress") return "done";
  return "pending";
}

function nextStatusLabel(status: TaskStatus) {
  if (status === "pending") return "بدء التنفيذ";
  if (status === "in_progress") return "إنهاء المهمة";
  return "إعادة فتح";
}

export default function TasksScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, updateData } = useAppData();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [sheet, setSheet] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());
  const [status, setStatus] = useState<TaskStatus>("pending");
  const [phase, setPhase] = useState<TaskPhase>("other");
  const [caseId, setCaseId] = useState("");
  const [notice, setNotice] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const visibleTasks = useMemo(() => data.tasks
    .filter((task) => filter === "all" || (filter === "overdue" ? isOverdue(task) : filter === "done" ? task.status === "done" : (task.phase ?? "other") === filter))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt)), [data.tasks, filter]);
  const overdueCount = useMemo(() => data.tasks.filter(isOverdue).length, [data.tasks]);
  const doneCount = useMemo(() => data.tasks.filter((task) => task.status === "done").length, [data.tasks]);

  function closeSheet() {
    if (busy) return;
    setSheet(null);
    setEditingId(null);
    setTitle("");
    setDueDate(todayISO());
    setStatus("pending");
    setPhase("other");
    setCaseId("");
    setFormMessage("");
  }

  function openCreate() {
    setEditingId(null);
    setTitle("");
    setDueDate(todayISO());
    setStatus("pending");
    setPhase("other");
    setCaseId("");
    setFormMessage("");
    setSheet("create");
  }

  function openEdit(task: OfficeTask) {
    setEditingId(task.id);
    setTitle(task.title);
    setDueDate(task.dueDate);
    setStatus(task.status);
    setPhase(task.phase ?? "other");
    setCaseId(task.caseId ?? "");
    setFormMessage("");
    setSheet("edit");
  }

  async function attemptSchedule(task: OfficeTask): Promise<NotificationAttempt> {
    try {
      const result = await scheduleTaskDeadline(task);
      return { ids: result.ids, enabled: result.enabled, failed: false };
    } catch (error) {
      const orphanIds = (error as Error & { orphanReminderIds?: string[] }).orphanReminderIds ?? [];
      return { ids: orphanIds, enabled: false, failed: true };
    }
  }

  async function saveNewTask(task: OfficeTask) {
    const scheduled = await attemptSchedule(task);
    const taskToStore = { ...task, reminderIds: scheduled.ids };
    try {
      await updateData((current) => ({ ...current, tasks: [...current.tasks, taskToStore] }));
    } catch {
      if (scheduled.ids.length) await cancelTaskReminders(taskToStore).catch(() => undefined);
      throw new Error("تعذر حفظ المهمة محلياً.");
    }

    if (task.status === "done") return "تم حفظ المهمة كمكتملة.";
    if (scheduled.failed) return "تم حفظ المهمة، لكن تعذرت جدولة التنبيه المحلي.";
    if (scheduled.ids.length) return "تم حفظ المهمة وجدولة تذكير يوم الاستحقاق وتنبيه صباح اليوم التالي إذا بقيت غير مكتملة.";
    return scheduled.enabled ? "تم حفظ المهمة دون تنبيه مستقبلي لهذا التاريخ." : "تم حفظ المهمة. اسمح بالإشعارات لتفعيل التنبيه المحلي.";
  }

  async function saveExistingTask(existing: OfficeTask, task: OfficeTask) {
    const scheduled = await attemptSchedule(task);
    const oldReminderIds = existing.reminderIds ?? [];
    const stagedTask = { ...task, reminderIds: uniqueIds([...oldReminderIds, ...scheduled.ids]) };

    try {
      await updateData((current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? stagedTask : item),
      }));
    } catch {
      if (scheduled.ids.length) {
        const failedNewIds = await cancelTaskReminders({ ...task, reminderIds: scheduled.ids }).catch(() => scheduled.ids);
        if (failedNewIds.length) {
          await updateData((current) => ({
            ...current,
            tasks: current.tasks.map((item) => item.id === task.id
              ? { ...item, reminderIds: uniqueIds([...(item.reminderIds ?? []), ...failedNewIds]) }
              : item),
          })).catch(() => undefined);
        }
      }
      throw new Error("تعذر حفظ تعديلات المهمة محلياً.");
    }

    const failedOldIds = await cancelTaskReminders({ ...existing, reminderIds: oldReminderIds }).catch(() => oldReminderIds);
    const finalReminderIds = uniqueIds([...scheduled.ids, ...failedOldIds]);
    let cleanupSaved = true;
    try {
      await updateData((current) => ({
        ...current,
        tasks: current.tasks.map((item) => item.id === task.id ? { ...item, reminderIds: finalReminderIds } : item),
      }));
    } catch {
      cleanupSaved = false;
    }

    if (task.status === "done") {
      if (failedOldIds.length) return "اكتملت المهمة، لكن تعذر إلغاء بعض التنبيهات؛ أبقينا معرفاتها محفوظة لإعادة المحاولة.";
      return cleanupSaved ? "اكتملت المهمة وأُلغي تنبيهها المحلي." : "اكتملت المهمة؛ ستبقى معرفات التنبيه محفوظة حتى تتم محاولة تنظيفها لاحقاً.";
    }
    if (failedOldIds.length) return "تم حفظ المهمة. تعذر إلغاء بعض التنبيهات القديمة؛ أبقينا معرفاتها محفوظة لإعادة المحاولة.";
    if (scheduled.failed) return "تم حفظ المهمة، لكن تعذرت إعادة جدولة التنبيه المحلي.";
    if (scheduled.ids.length) return "تم حفظ المهمة وتحديث تنبيه الاستحقاق والتأخر.";
    return scheduled.enabled ? "تم حفظ المهمة دون تنبيه مستقبلي لهذا التاريخ." : "تم حفظ المهمة. اسمح بالإشعارات لتفعيل التنبيه المحلي.";
  }

  async function saveTask() {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setFormMessage("أدخل عنوان المهمة.");
      return;
    }
    if (!isValidISODate(dueDate)) {
      setFormMessage("أدخل تاريخ استحقاق صحيحاً بصيغة YYYY-MM-DD.");
      return;
    }

    const existing = editingId ? data.tasks.find((item) => item.id === editingId) : undefined;
    const now = new Date().toISOString();
    const task: OfficeTask = {
      id: existing?.id ?? createId("task"),
      caseId: caseId || undefined,
      title: normalizedTitle,
      dueDate,
      status,
      phase,
      reminderIds: existing?.reminderIds ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    setBusy(true);
    setFormMessage("");
    try {
      const message = existing ? await saveExistingTask(existing, task) : await saveNewTask(task);
      closeSheet();
      setNotice(message);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "تعذر حفظ المهمة.");
    } finally {
      setBusy(false);
    }
  }

  async function changeTaskStatus(task: OfficeTask) {
    const newStatus = nextStatus(task.status);
    const updated: OfficeTask = { ...task, status: newStatus, updatedAt: new Date().toISOString() };
    setBusyTaskId(task.id);
    setNotice("");
    try {
      setNotice(await saveExistingTask(task, updated));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تحديث حالة المهمة.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function deleteTask(task: OfficeTask) {
    const confirmed = await confirmDestructiveAction("نقل المهمة إلى سلة المحذوفات؟", "ستبقى تفاصيل المهمة محفوظة للاستعادة، وسنحاول إلغاء تنبيهها المحلي بعد حفظ النقل.", "نقل إلى السلة");
    if (!confirmed) return;

    setBusyTaskId(task.id);
    setNotice("");
    try {
      await updateData((current) => moveRecordToTrash(current, "task", task.id).data);
      const failedReminderIds = await cancelTaskReminders(task).catch(() => task.reminderIds ?? []);
      if (failedReminderIds.length) await updateData((current) => ({ ...current, orphanReminderIds: uniqueIds([...(current.orphanReminderIds ?? []), ...failedReminderIds]) }));
      setNotice(failedReminderIds.length ? "نُقلت المهمة إلى السلة؛ أبقينا معرّفات التنبيه لتعذر إلغائها." : "نُقلت المهمة إلى السلة وأُلغي تنبيهها المحلي.");
    } catch {
      setNotice("تعذر نقل المهمة إلى السلة. بقيت محفوظة دون تغيير.");
    } finally {
      setBusyTaskId(null);
    }
  }

  function taskColor(task: OfficeTask) {
    if (isOverdue(task)) return colors.warning;
    if (task.status === "done") return colors.success;
    return task.status === "in_progress" ? colors.tint : colors.muted;
  }

  return <Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 30, gap: 16 }}>
    <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>مهام المكتب</Text>
        <Text style={{ color: colors.muted, textAlign: "right", marginTop: 5 }}>رتّب إجراءاتك وتابع ما يستحق اليوم</Text>
      </View>
      <Pressable accessibilityLabel="رجوع" onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
        <MaterialCommunityIcons name="arrow-right" size={23} color={colors.text} />
      </Pressable>
    </View>

    <Card style={{ padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: overdueCount ? `${colors.warning}18` : `${colors.tint}14` }}>
        <MaterialCommunityIcons name={overdueCount ? "alert-circle-outline" : "clipboard-check-outline"} size={23} color={overdueCount ? colors.warning : colors.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, textAlign: "right", fontWeight: "800" }}>{overdueCount ? `${overdueCount} مهام متأخرة تحتاج مراجعة` : "لا توجد مهام متأخرة"}</Text>
        <Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }}>{data.tasks.length} مهمة محفوظة · {doneCount} مكتملة</Text>
      </View>
      <Pressable onPress={openCreate} accessibilityLabel="إضافة مهمة" style={{ width: 39, height: 39, borderRadius: 13, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" }}>
        <MaterialCommunityIcons name="plus" size={22} color="#fff" />
      </Pressable>
    </Card>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 8 }}>
      {([
        { id: "all", label: "الكل" },
        { id: "overdue", label: `متأخرة${overdueCount ? ` (${overdueCount})` : ""}` },
        { id: "done", label: `مكتملة${doneCount ? ` (${doneCount})` : ""}` },
        ...phaseOptions,
      ] as { id: TaskFilter; label: string }[]).map((item) => <Pressable key={item.id} onPress={() => setFilter(item.id)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: filter === item.id ? colors.tint : colors.surface, borderWidth: 1, borderColor: filter === item.id ? colors.tint : colors.border }}>
        <Text style={{ color: filter === item.id ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>{item.label}</Text>
      </Pressable>)}
    </ScrollView>

    <View>
      <SectionTitle title={filter === "overdue" ? "المهام المتأخرة" : filter === "done" ? "المهام المكتملة" : filter === "all" ? `كل المهام (${visibleTasks.length})` : `قائمة ${phaseOptions.find((item) => item.id === filter)?.label ?? "المهام"}`} action="إضافة مهمة" onAction={openCreate} />
      {visibleTasks.length ? <View style={{ gap: 9 }}>{visibleTasks.map((task) => {
        const linkedCase = task.caseId ? data.cases.find((item) => item.id === task.caseId) : undefined;
        const overdue = isOverdue(task);
        const taskBusy = busyTaskId === task.id;
        return <Card key={task.id} style={{ padding: 15, borderColor: overdue ? `${colors.warning}90` : colors.border }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: `${taskColor(task)}16`, alignItems: "center", justifyContent: "center" }}>
              <MaterialCommunityIcons name={task.status === "done" ? "check-circle-outline" : task.status === "in_progress" ? "progress-clock" : overdue ? "alert-outline" : "clipboard-text-outline"} size={21} color={taskColor(task)} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, textAlign: "right", fontSize: 15, fontWeight: "800" }}>{task.title}</Text>
              <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "flex-start", gap: 6, marginTop: 8 }}>
                <Pill label={statusLabel(task.status)} color={taskColor(task)} />
                <Pill label={phaseOptions.find((item) => item.id === (task.phase ?? "other"))?.label ?? "أخرى"} color={colors.tint} />
                {overdue ? <Pill label="متأخرة" color={colors.warning} /> : null}
              </View>
            </View>
            <View style={{ flexDirection: "row-reverse", gap: 1 }}>
              <Pressable disabled={taskBusy} onPress={() => openEdit(task)} accessibilityLabel="تعديل المهمة" hitSlop={8} style={{ padding: 6, opacity: taskBusy ? 0.45 : 1 }}><MaterialCommunityIcons name="pencil-outline" size={19} color={colors.tint} /></Pressable>
              <Pressable disabled={taskBusy} onPress={() => void deleteTask(task)} accessibilityLabel="حذف المهمة" hitSlop={8} style={{ padding: 6, opacity: taskBusy ? 0.45 : 1 }}><MaterialCommunityIcons name="delete-outline" size={19} color={colors.warning} /></Pressable>
            </View>
          </View>
          <View style={{ marginTop: 13, paddingTop: 11, borderTopWidth: 1, borderTopColor: colors.border, gap: 5 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}><MaterialCommunityIcons name="calendar-outline" size={16} color={overdue ? colors.warning : colors.muted} /><Text style={{ color: overdue ? colors.warning : colors.muted, textAlign: "right", fontSize: 12, fontWeight: overdue ? "700" : "400" }}>{overdue ? `تجاوزت الاستحقاق: ${formatDate(task.dueDate)}` : `الاستحقاق: ${formatDate(task.dueDate)}`}</Text></View>
            {linkedCase ? <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}><MaterialCommunityIcons name="briefcase-outline" size={16} color={colors.muted} /><Text style={{ color: colors.muted, textAlign: "right", fontSize: 12 }}>مرتبطة بقضية: {linkedCase.title}</Text></View> : null}
            {task.caseId && !linkedCase ? <Text style={{ color: colors.warning, textAlign: "right", fontSize: 11 }}>القضية المرتبطة لم تعد متاحة.</Text> : null}
          </View>
          <Pressable disabled={taskBusy} onPress={() => void changeTaskStatus(task)} style={{ marginTop: 13, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 41, borderRadius: 12, borderWidth: 1, borderColor: taskColor(task), backgroundColor: `${taskColor(task)}10`, opacity: taskBusy ? 0.5 : 1 }}>
            <MaterialCommunityIcons name={task.status === "done" ? "backup-restore" : task.status === "in_progress" ? "check" : "play"} size={17} color={taskColor(task)} />
            <Text style={{ color: taskColor(task), fontSize: 12, fontWeight: "700" }}>{taskBusy ? "جارٍ الحفظ…" : nextStatusLabel(task.status)}</Text>
          </Pressable>
        </Card>;
      })}</View> : <Card><EmptyState icon={<MaterialCommunityIcons name={filter === "overdue" ? "calendar-check-outline" : "clipboard-text-outline"} size={25} color={colors.muted} />} title={filter === "overdue" ? "لا توجد مهام متأخرة" : filter === "done" ? "لا توجد مهام مكتملة" : "ابدأ بأول مهمة"} detail={filter === "all" ? "أضف إجراءً مع تاريخ استحقاق، واربطه بقضية عند الحاجة." : "غيّر الفلتر أو أضف مهمة جديدة لتظهر هنا."} /></Card>}
    </View>

    {notice ? <Card style={{ padding: 13, backgroundColor: `${colors.tint}0D` }}><Text style={{ color: colors.text, textAlign: "right", lineHeight: 21, fontSize: 12 }}>{notice}</Text></Card> : null}
    <Text style={{ color: colors.muted, textAlign: "center", fontSize: 10 }}>تُحفظ المهام محلياً ضمن خزنة المكتب المشفرة. التنبيه المحلي لا يتضمن اسم موكل أو قضية.</Text>
  </ScrollView>

  <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}>
    <KeyboardAvoidingSheet>
      <View style={{ maxHeight: "92%", backgroundColor: colors.surface, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{sheet === "edit" ? "تعديل المهمة" : "مهمة جديدة"}</Text>
            <Pressable disabled={busy} onPress={closeSheet} accessibilityLabel="إغلاق" style={{ padding: 4, opacity: busy ? 0.45 : 1 }}><MaterialCommunityIcons name="close" size={23} color={colors.muted} /></Pressable>
          </View>
          <Field label="عنوان المهمة" value={title} onChangeText={setTitle} placeholder="مثال: مراجعة مذكرة الجلسة" autoFocus />
          <Field label="تاريخ الاستحقاق" value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />

          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>حالة المهمة</Text>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 15 }}>
            {statusOptions.map((option) => <Pressable key={option.id} onPress={() => setStatus(option.id)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: status === option.id ? colors.tint : colors.background, borderWidth: 1, borderColor: status === option.id ? colors.tint : colors.border }}><Text style={{ color: status === option.id ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>{option.label}</Text></Pressable>)}
          </View>

          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>قائمة المرحلة</Text>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 15 }}>
            {phaseOptions.map((option) => <Pressable key={option.id} onPress={() => setPhase(option.id)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: phase === option.id ? colors.tint : colors.background, borderWidth: 1, borderColor: phase === option.id ? colors.tint : colors.border }}><Text style={{ color: phase === option.id ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>{option.label}</Text></Pressable>)}
          </View>

          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>القضية المرتبطة (اختياري)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 7, paddingBottom: 14 }}>
            <Pressable onPress={() => setCaseId("")} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: !caseId ? colors.tint : colors.border, backgroundColor: !caseId ? `${colors.tint}14` : colors.background }}><Text style={{ color: colors.text, fontSize: 12 }}>دون ربط</Text></Pressable>
            {data.cases.map((item) => <Pressable key={item.id} onPress={() => setCaseId(caseId === item.id ? "" : item.id)} style={{ paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: caseId === item.id ? colors.tint : colors.border, backgroundColor: caseId === item.id ? `${colors.tint}14` : colors.background }}><Text style={{ color: colors.text, fontSize: 12 }}>{item.title}</Text></Pressable>)}
          </ScrollView>
          <Text style={{ color: colors.muted, textAlign: "right", lineHeight: 19, fontSize: 11, marginBottom: 14 }}>سنحاول جدولة تذكير عام الساعة 9 صباحاً يوم الاستحقاق وتنبيه واحد صباح اليوم التالي إذا بقيت المهمة غير مكتملة. لا يتضمن التنبيه اسم الموكل أو القضية.</Text>
          {formMessage ? <Text style={{ color: colors.warning, textAlign: "right", marginBottom: 12, fontSize: 12 }}>{formMessage}</Text> : null}
          <Button title={busy ? "جارٍ الحفظ…" : sheet === "edit" ? "حفظ التعديلات" : "حفظ المهمة"} onPress={() => void saveTask()} disabled={busy} icon={<MaterialCommunityIcons name="content-save-outline" size={17} color="#fff" />} />
        </ScrollView>
      </View>
    </KeyboardAvoidingSheet>
  </Modal>
</Page>;
}
