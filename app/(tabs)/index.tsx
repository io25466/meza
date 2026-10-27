import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAvoidingSheet } from "@/components/keyboard-avoiding-sheet";
import { AppText as Text } from "@/components/app-text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { createId, isValidISODate, totalReceivables, type Appointment } from "@/lib/models";
import { cancelScheduledReminders, scheduleAppointmentReminders, todayISO } from "@/lib/notifications";
import { appointmentConflictMessage, findAppointmentConflicts } from "@/lib/appointment-conflicts";
import { confirmDestructiveAction } from "@/lib/confirm";
import { moveRecordToTrash } from "@/lib/trash";
import { Button, Card, EmptyState, Field, Page, Pill, SectionTitle } from "@/components/ui";
import { lawyerGreeting } from "@/lib/lawyer-greeting";

const weekdays = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];
function isoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const fmtAmount = (value: number, currency: string) => `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(value)} ${currency}`;

function AppointmentModal({ appointment, initialDate, onClose }: { appointment?: Appointment; initialDate: string; onClose: () => void }) {
  const colors = useColors();
  const { data, updateData } = useAppData();
  const [caseId, setCaseId] = useState(appointment?.caseId ?? "");
  const [title, setTitle] = useState(appointment?.title ?? "");
  const [date, setDate] = useState(appointment?.date ?? initialDate);
  const [time, setTime] = useState(appointment?.time ?? "10:00");
  const [kind, setKind] = useState<"hearing" | "meeting">(appointment?.kind ?? "hearing");
  const [location, setLocation] = useState(appointment?.location ?? "");
  const [status, setStatus] = useState<NonNullable<Appointment["status"]>>(appointment?.status ?? "scheduled");
  const [sessionNotes, setSessionNotes] = useState(appointment?.sessionNotes ?? "");
  const [decision, setDecision] = useState(appointment?.decision ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const conflictMessage = useMemo(() => appointmentConflictMessage(findAppointmentConflicts(data.appointments, {
    id: appointment?.id ?? "draft-appointment",
    caseId: caseId || undefined,
    title: title.trim() || "موعد جديد",
    kind,
    date,
    time,
    location: location.trim(),
    reminders: [],
  }, appointment?.id)), [data.appointments, appointment?.id, caseId, title, kind, date, time, location]);

  async function save() {
    const [hour, minute] = time.split(":").map(Number);
    if (!title.trim() || !isValidISODate(date) || !/^\d{2}:\d{2}$/.test(time) || hour > 23 || minute > 59) {
      setMessage("أدخل عنواناً وتاريخاً ووقتاً صحيحاً.");
      return;
    }
    setBusy(true);
    setMessage("");
    const existing = appointment ? data.appointments.find((item) => item.id === appointment.id) : undefined;
    const item: Appointment = {
      id: existing?.id ?? createId("apt"),
      caseId: caseId || undefined,
      title: title.trim(),
      kind,
      date,
      time,
      location: location.trim(),
      status: kind === "hearing" ? status : "scheduled",
      sessionNotes: kind === "hearing" ? sessionNotes.trim() || undefined : undefined,
      decision: kind === "hearing" ? decision.trim() || undefined : undefined,
      reminders: [],
    };
    try {
      const reminderResult = await scheduleAppointmentReminders(item, {
        reminder24hEnabled: data.reminder24hEnabled,
        reminder1hEnabled: data.reminder1hEnabled,
      });
      item.reminders = reminderResult.ids;
      try {
        await updateData((current) => ({
          ...current,
          appointments: existing
            ? current.appointments.map((currentItem) => currentItem.id === item.id ? item : currentItem).sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
            : [...current.appointments, item].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)),
        }));
      } catch (error) {
        await cancelScheduledReminders(item.reminders);
        throw error;
      }
      const oldIds = existing?.reminders ?? [];
      const failedOldIds = oldIds.length ? await cancelScheduledReminders(oldIds) : [];
      if (failedOldIds.length) {
        const keptReminders = [...new Set([...item.reminders, ...failedOldIds])];
        await updateData((current) => ({ ...current, appointments: current.appointments.map((currentItem) => currentItem.id === item.id ? { ...currentItem, reminders: keptReminders } : currentItem) }));
      }
      setMessage(failedOldIds.length
        ? "حُفظ الموعد، لكن تعذر إلغاء بعض التذكيرات القديمة. أبقينا معرّفاتها محفوظة."
        : reminderResult.ids.length
          ? existing ? "تم تحديث الموعد وإعادة جدولة تذكيراته." : "تم حفظ الموعد وجدولة التذكيرات."
          : reminderResult.enabled ? "تم حفظ الموعد دون تذكير لهذا التاريخ أو وفق إعداداتك." : "تم حفظ الموعد. اسمح بالإشعارات لتفعيل التذكيرات على الهاتف.");
      setTimeout(onClose, 650);
    } catch {
      setMessage("تعذر حفظ الموعد. تحقق من الخزنة وإذن الإشعارات ثم أعد المحاولة.");
    } finally { setBusy(false); }
  }

  return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingSheet><View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, maxHeight: "92%" }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 16 }}><Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{appointment ? "تعديل الموعد" : "موعد جديد"}</Text><Pressable onPress={onClose} accessibilityLabel="إغلاق"><MaterialCommunityIcons name="close" size={23} color={colors.muted} /></Pressable></View>
        <Field label="عنوان الموعد" value={title} onChangeText={setTitle} placeholder="مثال: جلسة نظر" returnKeyType="next" />
        <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 12 }}>{(["hearing", "meeting"] as const).map((value) => <Pressable key={value} onPress={() => setKind(value)} style={{ flex: 1, padding: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: kind === value ? colors.tint : colors.border, backgroundColor: kind === value ? `${colors.tint}14` : colors.background }}><Text style={{ color: colors.text, fontWeight: "700" }}>{value === "hearing" ? "جلسة" : "اجتماع"}</Text></Pressable>)}</View>
        <View style={{ flexDirection: "row-reverse", gap: 10 }}><View style={{ flex: 1 }}><Field label="التاريخ" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" /></View><View style={{ flex: 1 }}><Field label="الوقت" value={time} onChangeText={setTime} placeholder="10:00" /></View></View>
        <Field label="المحكمة أو الموقع (اختياري)" value={location} onChangeText={setLocation} placeholder="المحكمة / المكتب" />
        {kind === "hearing" ? <>
          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>حالة الجلسة</Text>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>{([{ value: "scheduled", label: "مجدولة" }, { value: "completed", label: "انعقدت" }, { value: "postponed", label: "أُجّلت" }, { value: "cancelled", label: "أُلغيت" }] as const).map((item) => <Pressable key={item.value} onPress={() => setStatus(item.value)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: status === item.value ? colors.tint : colors.background, borderWidth: 1, borderColor: status === item.value ? colors.tint : colors.border }}><Text style={{ color: status === item.value ? "#fff" : colors.text, fontSize: 11, fontWeight: "700" }}>{item.label}</Text></Pressable>)}</View>
          <Field label="ملاحظات الجلسة" value={sessionNotes} onChangeText={setSessionNotes} placeholder="ما جرى في الجلسة…" multiline />
          <Field label="القرار أو النتيجة" value={decision} onChangeText={setDecision} placeholder="قرار المحكمة أو موعد الجلسة التالية…" multiline />
        </> : null}
        {conflictMessage ? <View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, marginBottom: 12, padding: 11, borderRadius: 12, backgroundColor: `${colors.warning}14`, borderWidth: 1, borderColor: `${colors.warning}55` }}><MaterialCommunityIcons name="alert-outline" size={18} color={colors.warning} /><Text style={{ flex: 1, color: colors.warning, textAlign: "right", fontSize: 11, lineHeight: 18 }}>{conflictMessage}</Text></View> : null}
        {data.cases.length ? <View style={{ marginBottom: 12 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>القضية المرتبطة (اختياري)</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 7 }}><Pressable onPress={() => setCaseId("")} style={{ padding: 9, borderRadius: 12, borderWidth: 1, borderColor: !caseId ? colors.tint : colors.border, backgroundColor: !caseId ? `${colors.tint}14` : colors.background }}><Text style={{ color: colors.text, fontSize: 12 }}>بدون ربط</Text></Pressable>{data.cases.map((item) => <Pressable key={item.id} onPress={() => setCaseId(caseId === item.id ? "" : item.id)} style={{ padding: 9, borderRadius: 12, borderWidth: 1, borderColor: caseId === item.id ? colors.tint : colors.border, backgroundColor: caseId === item.id ? `${colors.tint}14` : colors.background }}><Text style={{ color: colors.text, fontSize: 12 }}>{item.title}</Text></Pressable>)}</ScrollView></View> : null}
        <Text style={{ color: colors.muted, textAlign: "right", fontSize: 12, marginBottom: 14 }}>تذكير محلي قبل الموعد بـ24 ساعة وساعة واحدة وفق إعداداتك.</Text>
        {message ? <Text style={{ textAlign: "right", color: message.startsWith("تعذر") ? colors.error : colors.tint, marginBottom: 12 }}>{message}</Text> : null}
        <Button title={busy ? "جارٍ الحفظ…" : appointment ? "حفظ تعديلات الموعد" : "حفظ الموعد"} onPress={() => void save()} disabled={busy} />
      </ScrollView>
    </View></KeyboardAvoidingSheet>
  </Modal>;
}

export default function DashboardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, updateData } = useAppData();
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [month, setMonth] = useState(new Date());
  const [showAppointment, setShowAppointment] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | undefined>();
  const [quickActions, setQuickActions] = useState(false);
  const [notice, setNotice] = useState("");
  const cells = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const totalDays = new Date(year, monthIndex + 1, 0).getDate();
    const offset = (firstDay.getDay() + 1) % 7;
    return [...Array(offset).fill(null), ...Array.from({ length: totalDays }, (_, index) => isoDate(new Date(year, monthIndex, index + 1)))];
  }, [month]);
  const visibleAppointments = data.appointments.filter((item) => item.date === selectedDay).sort((a, b) => a.time.localeCompare(b.time));
  const monthLabel = month.toLocaleDateString("ar-SA", { month: "long", year: "numeric" });
  const due = totalReceivables(data);
  const todayCaseCount = new Set(data.appointments.filter((item) => item.date === todayISO() && item.kind === "hearing").map((item) => item.caseId ?? item.id)).size;

  function openCreateAppointment() {
    setEditingAppointment(undefined);
    setShowAppointment(true);
  }

  function openEditAppointment(appointment: Appointment) {
    setEditingAppointment(appointment);
    setShowAppointment(true);
  }

  async function deleteAppointment(appointment: Appointment) {
    const confirmed = await confirmDestructiveAction("نقل الموعد إلى سلة المحذوفات؟", `سيُنقل «${appointment.title}» إلى السلة ويمكن استعادته لاحقاً، وستُلغى تذكيراته المجدولة قدر الإمكان.`, "نقل إلى السلة");
    if (!confirmed) return;
    try {
      await updateData((current) => moveRecordToTrash(current, "appointment", appointment.id).data);
      const failed = await cancelScheduledReminders(appointment.reminders);
      if (failed.length) await updateData((current) => ({ ...current, orphanReminderIds: [...new Set([...(current.orphanReminderIds ?? []), ...failed])] }));
      setNotice(failed.length ? "نُقل الموعد إلى السلة؛ أبقينا معرّفات بعض التنبيهات لإعادة محاولة إلغائها." : "نُقل الموعد وتذكيراته إلى سلة المحذوفات.");
    } catch {
      setNotice("تعذر نقل الموعد إلى السلة؛ بقي في الأجندة.");
    }
  }

  const shortcuts = [
    { label: "المهام", detail: `${data.tasks.filter((task) => task.status !== "done").length} مفتوحة`, icon: "checkbox-marked-circle-outline", color: colors.tint, action: () => router.push("/(tabs)/tasks" as never) },
    { label: "قوالب المستندات", detail: `${data.templates.length} قالب`, icon: "file-document-edit-outline", color: colors.success, action: () => router.push("/(tabs)/templates" as never) },
  ];

  return <Page>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30, gap: 17 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
        <View><Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>{lawyerGreeting(data.lawyerName)}</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 5 }}>{new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}</Text></View>
        <Pressable onPress={() => setQuickActions(true)} accessibilityLabel="إضافة سريعة" style={{ backgroundColor: colors.tint, width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name="plus" size={24} color="#fff" /></Pressable>
      </View>

      <View style={{ flexDirection: "row-reverse", gap: 9 }}>
        <Card style={{ flex: 1, padding: 14 }}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 }}><MaterialCommunityIcons name="gavel" size={18} color={colors.tint} /><Text style={{ color: colors.muted, textAlign: "right", fontSize: 11 }}>قضايا اليوم</Text></View><Text style={{ color: colors.text, textAlign: "right", fontSize: 23, fontWeight: "800", marginTop: 7 }}>{todayCaseCount}</Text></Card>
        <Pressable onPress={() => router.push("/(tabs)/finance" as never)} style={{ flex: 1 }}><Card style={{ padding: 14 }}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 }}><MaterialCommunityIcons name="cash-clock" size={18} color={colors.warning} /><Text style={{ color: colors.muted, textAlign: "right", fontSize: 11 }}>الأتعاب المتبقية</Text></View><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.text, textAlign: "right", fontSize: 17, fontWeight: "800", marginTop: 9 }}>{fmtAmount(due, data.currency)}</Text></Card></Pressable>
      </View>

      <View>
        <SectionTitle title={selectedDay === todayISO() ? "أجندة اليوم" : `أجندة ${selectedDay}`} action="إضافة موعد" onAction={openCreateAppointment} />
        {visibleAppointments.length ? <View style={{ gap: 9 }}>{visibleAppointments.map((item) => <Card key={item.id} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 9, padding: 13 }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: `${colors.tint}14`, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name={item.kind === "hearing" ? "gavel" : "account-group-outline"} size={21} color={colors.tint} /></View>
          <View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700" }}>{item.title}</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 11 }}>{item.location || (item.kind === "hearing" ? "جلسة" : "اجتماع")}</Text></View>
          <View style={{ alignItems: "center", gap: 4 }}><Pill label={item.time} /><View style={{ flexDirection: "row-reverse" }}><Pressable onPress={() => openEditAppointment(item)} accessibilityLabel="تعديل الموعد" hitSlop={7} style={{ padding: 4 }}><MaterialCommunityIcons name="pencil-outline" size={17} color={colors.tint} /></Pressable><Pressable onPress={() => void deleteAppointment(item)} accessibilityLabel="حذف الموعد" hitSlop={7} style={{ padding: 4 }}><MaterialCommunityIcons name="delete-outline" size={17} color={colors.error} /></Pressable></View></View>
        </Card>)}</View> : <Card><EmptyState icon={<MaterialCommunityIcons name="calendar-blank-outline" color={colors.muted} size={23} />} title="لا توجد مواعيد لهذا اليوم" detail="أضف جلسة أو اجتماعاً لتظهر التذكيرات في أجندتك." /></Card>}
      </View>

      <Card style={{ padding: 15 }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>تقويم المواعيد</Text><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}><Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} accessibilityLabel="الشهر السابق"><MaterialCommunityIcons name="chevron-right" size={22} color={colors.text} /></Pressable><Text style={{ color: colors.muted, fontSize: 12, minWidth: 95, textAlign: "center" }}>{monthLabel}</Text><Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} accessibilityLabel="الشهر التالي"><MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} /></Pressable></View></View>
        <View style={{ flexDirection: "row-reverse", marginBottom: 5 }}>{weekdays.map((day, index) => <Text key={`${day}-${index}`} style={{ flex: 1, textAlign: "center", color: colors.muted, fontSize: 10, paddingVertical: 7 }}>{day}</Text>)}</View>
        <View style={{ flexDirection: "row-reverse", flexWrap: "wrap" }}>{cells.map((date, index) => {
          if (!date) return <View key={`blank-${index}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
          const dayNumber = Number(date.slice(-2));
          const selected = date === selectedDay;
          const marked = data.appointments.some((item) => item.date === date);
          return <Pressable key={date} onPress={() => setSelectedDay(date)} accessibilityLabel={`تاريخ ${date}`} style={{ width: `${100 / 7}%`, height: 42, alignItems: "center", justifyContent: "center" }}><View style={{ width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: selected ? colors.tint : "transparent" }}><Text style={{ color: selected ? "#fff" : date === todayISO() ? colors.tint : colors.text, fontWeight: selected || date === todayISO() ? "800" : "500", fontSize: 13 }}>{dayNumber}</Text></View>{marked ? <View style={{ width: 4, height: 4, borderRadius: 3, backgroundColor: selected ? "#fff" : colors.success, position: "absolute", bottom: 1 }} /> : null}</Pressable>;
        })}</View>
      </Card>

      <View>
        <SectionTitle title="اختصارات العمل" />
        <View style={{ flexDirection: "row-reverse", gap: 9 }}>{shortcuts.map((item) => <Pressable key={item.label} onPress={item.action} style={{ flex: 1 }}><Card style={{ padding: 14, minHeight: 89 }}><View style={{ flexDirection: "row-reverse", gap: 9, alignItems: "center" }}><View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: `${item.color}16`, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name={item.icon as never} size={19} color={item.color} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12 }}>{item.label}</Text><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 4 }}>{item.detail}</Text></View></View></Card></Pressable>)}</View>
      </View>

      <View style={{ flexDirection: "row-reverse", gap: 8 }}><View style={{ flex: 1 }}><Button title="موكل جديد" onPress={() => router.push("/(tabs)/clients" as never)} secondary icon={<MaterialCommunityIcons name="account-plus-outline" size={16} color={colors.text} />} /></View><View style={{ flex: 1 }}><Button title="تسجيل دفعة" onPress={() => router.push("/(tabs)/finance" as never)} secondary icon={<MaterialCommunityIcons name="cash-plus" size={16} color={colors.text} />} /></View></View>
      {notice ? <Pressable onPress={() => setNotice("")} style={{ padding: 12, borderRadius: 12, backgroundColor: `${colors.tint}12` }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 12 }}>{notice}</Text></Pressable> : null}
      <Text style={{ color: Platform.OS === "web" ? colors.warning : colors.muted, textAlign: "center", fontSize: 10 }}>{Platform.OS === "web" ? "معاينة الويب غير مشفرة؛ لا تدخل بيانات موكلين حقيقية هنا." : "بياناتك مشفرة ومحفوظة على هذا الجهاز فقط"}</Text>
    </ScrollView>

    {showAppointment ? <AppointmentModal key={editingAppointment?.id ?? `new-${selectedDay}`} appointment={editingAppointment} initialDate={selectedDay} onClose={() => { setShowAppointment(false); setEditingAppointment(undefined); }} /> : null}
    <Modal transparent visible={quickActions} animationType="fade" onRequestClose={() => setQuickActions(false)}><Pressable onPress={() => setQuickActions(false)} style={{ flex: 1, backgroundColor: "#0007", justifyContent: "flex-end" }}><View onStartShouldSetResponder={() => true} style={{ backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 10 }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 18, fontWeight: "800", marginBottom: 8 }}>إضافة سريعة</Text>{[
      { label: "موعد جلسة أو اجتماع", icon: "calendar-plus", action: openCreateAppointment },
      { label: "موكل أو قضية", icon: "account-plus-outline", action: () => router.push("/(tabs)/clients" as never) },
      { label: "تسجيل دفعة", icon: "cash-plus", action: () => router.push("/(tabs)/finance" as never) },
      { label: "مهمة مرتبطة بقضية", icon: "checkbox-marked-circle-outline", action: () => router.push("/(tabs)/tasks" as never) },
      { label: "قالب مستند", icon: "file-document-edit-outline", action: () => router.push("/(tabs)/templates" as never) },
    ].map((item) => <Pressable key={item.label} onPress={() => { setQuickActions(false); item.action(); }} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.background }}><MaterialCommunityIcons name={item.icon as never} size={21} color={colors.tint} /><Text style={{ color: colors.text, fontWeight: "700" }}>{item.label}</Text></Pressable>)}</View></Pressable></Modal>
  </Page>;
}
