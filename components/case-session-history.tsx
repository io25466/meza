import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/app-text";
import { KeyboardAvoidingSheet } from "@/components/keyboard-avoiding-sheet";
import { Button, Card, Field } from "@/components/ui";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { previousHearingSessions } from "@/lib/session-history";
import type { Appointment, AppData } from "@/lib/models";

const statusOptions = [
  { value: "scheduled", label: "مجدولة" },
  { value: "completed", label: "انعقدت" },
  { value: "postponed", label: "أُجّلت" },
  { value: "cancelled", label: "أُلغيت" },
] as const;

function localDateISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function statusLabel(appointment: Appointment) {
  if (appointment.status) return statusOptions.find((item) => item.value === appointment.status)?.label ?? "جلسة سابقة";
  return "انتهى موعدها";
}

export function CaseSessionHistory({ data, caseId }: { data: AppData; caseId: string }) {
  const colors = useColors();
  const { updateData } = useAppData();
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<NonNullable<Appointment["status"]>>("scheduled");
  const [sessionNotes, setSessionNotes] = useState("");
  const [decision, setDecision] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sessions = useMemo(() => previousHearingSessions(data.appointments, caseId, localDateISO()), [data.appointments, caseId]);
  const selected = sessions.find((item) => item.id === selectedId);

  function openSession(appointment: Appointment) {
    setSelectedId(appointment.id);
    setEditing(false);
    setMessage("");
  }

  function startEditing() {
    if (!selected) return;
    setStatus(selected.status ?? "scheduled");
    setSessionNotes(selected.sessionNotes ?? "");
    setDecision(selected.decision ?? "");
    setEditing(true);
  }

  async function saveSession() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await updateData((current) => ({
        ...current,
        appointments: current.appointments.map((item) => item.id === selected.id ? {
          ...item,
          status,
          sessionNotes: sessionNotes.trim() || undefined,
          decision: decision.trim() || undefined,
        } : item),
      }));
      setSelectedId(null);
      setEditing(false);
    } catch {
      setMessage("تعذر حفظ تفاصيل الجلسة؛ بقيت البيانات السابقة كما هي.");
    } finally { setBusy(false); }
  }

  return <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
    <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button" accessibilityLabel="عرض سجل الجلسات السابقة" style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", minHeight: 38 }}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 }}>
        <MaterialCommunityIcons name="history" size={18} color={colors.tint} />
        <Text style={{ color: colors.tint, fontSize: 12, fontWeight: "800" }}>سجل الجلسات السابقة</Text>
        <Text style={{ color: colors.muted, fontSize: 10 }}>({sessions.length})</Text>
      </View>
      <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
    </Pressable>
    {expanded ? sessions.length ? <View style={{ gap: 7, paddingTop: 7 }}>
      {sessions.map((appointment) => <Pressable key={appointment.id} onPress={() => openSession(appointment)} style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 9, padding: 10, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
        <MaterialCommunityIcons name="calendar-check-outline" size={18} color={colors.tint} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12 }}>{appointment.title}</Text>
          <Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 3 }}>{appointment.date} · {appointment.time} · {statusLabel(appointment)}</Text>
          {appointment.decision ? <Text numberOfLines={2} style={{ color: colors.text, textAlign: "right", fontSize: 10, lineHeight: 16, marginTop: 5 }}>القرار: {appointment.decision}</Text> : null}
          {appointment.sessionNotes ? <Text numberOfLines={2} style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 16, marginTop: 3 }}>ملاحظات: {appointment.sessionNotes}</Text> : null}
        </View>
        <MaterialCommunityIcons name="chevron-left" size={18} color={colors.muted} />
      </Pressable>)}
    </View> : <Card style={{ padding: 11, marginTop: 5 }}><Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, lineHeight: 18 }}>تظهر هنا تلقائياً جلسات هذه القضية التي انتهى تاريخها أو حُدثت حالتها إلى منعقدة أو مؤجلة أو ملغاة.</Text></Card> : null}

    <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => { setSelectedId(null); setEditing(false); }}>
      <KeyboardAvoidingSheet><View style={{ maxHeight: "92%", backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 18, fontWeight: "800" }}>{editing ? "تعديل سجل الجلسة" : selected?.title}</Text><Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, marginTop: 4 }}>{selected?.date} · {selected?.time}</Text></View>
            <Pressable onPress={() => { setSelectedId(null); setEditing(false); }} accessibilityLabel="إغلاق"><MaterialCommunityIcons name="close" size={22} color={colors.muted} /></Pressable>
          </View>
          {editing ? <>
            <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>الحالة</Text>
            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>{statusOptions.map((option) => <Pressable key={option.value} onPress={() => setStatus(option.value)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: status === option.value ? colors.tint : colors.background, borderWidth: 1, borderColor: status === option.value ? colors.tint : colors.border }}><Text style={{ color: status === option.value ? "#fff" : colors.text, fontSize: 11 }}>{option.label}</Text></Pressable>)}</View>
            <Field label="ملاحظات الجلسة" value={sessionNotes} onChangeText={setSessionNotes} placeholder="ما جرى في الجلسة…" multiline />
            <Field label="القرار أو النتيجة" value={decision} onChangeText={setDecision} placeholder="القرار أو موعد الجلسة التالية…" multiline />
            <View style={{ flexDirection: "row-reverse", gap: 8 }}><View style={{ flex: 1 }}><Button title={busy ? "جارٍ الحفظ…" : "حفظ التعديلات"} onPress={() => void saveSession()} disabled={busy} /></View><View style={{ flex: 1 }}><Button title="إلغاء" secondary onPress={() => setEditing(false)} disabled={busy} /></View></View>
          </> : <>
            <Card><Text style={{ color: colors.tint, textAlign: "right", fontWeight: "700", fontSize: 12 }}>الحالة: {selected ? statusLabel(selected) : "—"}</Text><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12, marginTop: 13 }}>ملاحظات الجلسة</Text><Text selectable style={{ color: colors.text, textAlign: "right", fontSize: 13, lineHeight: 23, marginTop: 5 }}>{selected?.sessionNotes || "لا توجد ملاحظات محفوظة."}</Text><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12, marginTop: 14 }}>القرار أو النتيجة</Text><Text selectable style={{ color: colors.text, textAlign: "right", fontSize: 13, lineHeight: 23, marginTop: 5 }}>{selected?.decision || "لا يوجد قرار مسجل."}</Text>{selected?.location ? <Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, marginTop: 12 }}>المحكمة/الموقع: {selected.location}</Text> : null}</Card>
            <Button title="تعديل الحالة أو الملاحظات" secondary onPress={startEditing} />
          </>}
          {message ? <Text style={{ color: colors.error, textAlign: "right", fontSize: 11, marginTop: 8 }}>{message}</Text> : null}
        </ScrollView>
      </View></KeyboardAvoidingSheet>
    </Modal>
  </View>;
}
