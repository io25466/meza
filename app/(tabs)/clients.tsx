import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { AppText as Text } from "@/components/app-text";
import { KeyboardAvoidingSheet } from "@/components/keyboard-avoiding-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { createId, isValidISODate, paymentStatus, remainingBalance, type LegalCase, type VaultFile } from "@/lib/models";
import { decryptAttachment, deleteEncryptedAttachment, deleteTemporaryCacheFile, encryptAttachment } from "@/lib/secure-vault";
import { confirmDestructiveAction } from "@/lib/confirm";
import { moveRecordToTrash } from "@/lib/trash";
import { cancelScheduledReminders } from "@/lib/notifications";
import { addAuditEntry, auditAdvanceChange } from "@/lib/financial-audit";
import { SYRIA_COURT_LEVEL_SUGGESTIONS, SYRIA_GOVERNORATE_SUGGESTIONS, SYRIA_NOTICE } from "@/lib/legal-syria";
import { CaseTimelinePanel } from "@/components/case-timeline-panel";
import { CaseSessionHistory } from "@/components/case-session-history";
import { Button, Card, EmptyState, Field, Page, Pill, SectionTitle } from "@/components/ui";

type CaseFileDraft = { uri: string; name: string; mimeType: string };
const CASE_FILE_TYPES = ["image/*", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
const MAX_CASE_FILE_SIZE = 8 * 1024 * 1024;
const fmt = (n: number, currency: string) => `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(n)} ${currency}`;

export default function ClientsScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ createCase?: string | string[] }>();
  const createCaseParam = Array.isArray(params.createCase) ? params.createCase[0] : params.createCase;
  const widgetRequestHandled = useRef(false);
  const { data, updateData } = useAppData();
  const [filter, setFilter] = useState<"all" | "clients" | "cases">("all");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [modal, setModal] = useState<"client" | "case" | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [caseType, setCaseType] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [court, setCourt] = useState("");
  const [courtLevel, setCourtLevel] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [status, setStatus] = useState("قائمة");
  const [fees, setFees] = useState("");
  const [advance, setAdvance] = useState("");
  const [advanceDate, setAdvanceDate] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const [caseAttachments, setCaseAttachments] = useState<CaseFileDraft[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const activeCases = useMemo(() => data.cases.filter((item) => !["منتهية", "مغلقة"].includes(item.status)).length, [data.cases]);
  const profileClient = data.clients.find((item) => item.id === profileId);
  const profileCases = data.cases.filter((item) => item.clientId === profileId);
  const profileCaseIds = profileCases.map((item) => item.id);
  const profilePayments = data.payments.filter((item) => profileCaseIds.includes(item.caseId));
  const profilePowers = data.powers.filter((item) => item.clientId === profileId);
  const editingCaseFiles = data.files.filter((file) => file.caseId === editingCaseId);

  function openNewClient() {
    setEditingClientId(null); setClientName(""); setPhone(""); setMessage(""); setModal("client");
  }

  function openClientEdit(clientId: string) {
    const client = data.clients.find((item) => item.id === clientId);
    if (!client) return;
    setEditingClientId(client.id); setClientName(client.name); setPhone(client.phone); setMessage("");
    setProfileId(null); setModal("client");
  }

  function openNewCase(clientId?: string) {
    setEditingCaseId(null); setCaseTitle(""); setCaseType(""); setCaseNumber(""); setCourt(""); setCourtLevel(""); setGovernorate(""); setStatus("قائمة");
    setFees(""); setAdvance(""); setAdvanceDate(new Date().toISOString().slice(0, 10)); setSelectedClient(clientId ?? data.clients[0]?.id ?? ""); setCaseAttachments([]);
    setMessage(""); setModal("case");
  }

  function openCaseEdit(caseId: string) {
    const legalCase = data.cases.find((item) => item.id === caseId);
    if (!legalCase) return;
    setEditingCaseId(legalCase.id); setCaseTitle(legalCase.title); setCaseType(legalCase.type);
    setCaseNumber(legalCase.caseNumber ?? ""); setCourt(legalCase.court ?? ""); setCourtLevel(legalCase.courtLevel ?? ""); setGovernorate(legalCase.governorate ?? ""); setStatus(legalCase.status);
    setFees(String(legalCase.totalFees)); setAdvance(String(legalCase.advancePayment)); setAdvanceDate(legalCase.advancePaymentDate ?? legalCase.createdAt.slice(0, 10)); setSelectedClient(legalCase.clientId);
    setCaseAttachments([]); setMessage(""); setModal("case");
  }

  async function closeModal() {
    await Promise.all(caseAttachments.map((file) => deleteTemporaryCacheFile(file.uri)));
    setModal(null); setEditingClientId(null); setEditingCaseId(null); setClientName(""); setPhone("");
    setCaseTitle(""); setCaseType(""); setCaseNumber(""); setCourt(""); setCourtLevel(""); setGovernorate(""); setFees(""); setAdvance(""); setAdvanceDate("");
    setCaseAttachments([]); setMessage("");
  }

  async function saveClient() {
    if (!clientName.trim()) { setMessage("أدخل اسم الموكل"); return; }
    setBusy(true);
    try {
      if (editingClientId) {
        await updateData((current) => ({ ...current, clients: current.clients.map((client) => client.id === editingClientId ? { ...client, name: clientName.trim(), phone: phone.trim() } : client) }));
      } else {
        await updateData((current) => ({ ...current, clients: [...current.clients, { id: createId("cli"), name: clientName.trim(), phone: phone.trim(), createdAt: new Date().toISOString() }] }));
      }
      await closeModal();
    } catch { setMessage("تعذر حفظ بيانات الموكل."); }
    finally { setBusy(false); }
  }

  async function archiveRecord(kind: "client" | "case", recordId: string): Promise<boolean> {
    let reminderIds: string[] = [];
    await updateData((current) => {
      const moved = moveRecordToTrash(current, kind, recordId);
      reminderIds = moved.reminderIds;
      return moved.data;
    });
    const failedIds = reminderIds.length ? await cancelScheduledReminders(reminderIds) : [];
    if (failedIds.length) {
      await updateData((current) => ({ ...current, orphanReminderIds: [...new Set([...(current.orphanReminderIds ?? []), ...failedIds])] }));
    }
    return failedIds.length > 0;
  }

  async function deleteCaseRecord(legalCase: LegalCase) {
    const confirmed = await confirmDestructiveAction(
      "نقل القضية إلى سلة المحذوفات؟",
      `ستُنقل «${legalCase.title}» مع أقساطها ومواعيدها ومهامها ومصروفاتها ومرفقاتها المشفرة. يمكنك استعادتها من الإعدادات ← سلة المحذوفات؛ لا تُمحى الملفات نهائياً إلا من هناك.`,
      "نقل إلى السلة",
    );
    if (!confirmed) return;
    try {
      const remindersNeedRetry = await archiveRecord("case", legalCase.id);
      setProfileId(null);
      setMessage(remindersNeedRetry ? "نُقلت القضية إلى السلة؛ أبقينا معرّفات بعض التنبيهات لإعادة محاولة إلغائها." : "نُقلت القضية وسجلاتها إلى سلة المحذوفات.");
    } catch {
      setMessage("تعذر نقل القضية إلى السلة؛ بقيت سجلاتها كما هي.");
    }
  }

  async function deleteClientRecord(clientId: string) {
    const client = data.clients.find((item) => item.id === clientId);
    if (!client) return;
    const caseCount = data.cases.filter((item) => item.clientId === clientId).length;
    const confirmed = await confirmDestructiveAction(
      "نقل الموكل إلى سلة المحذوفات؟",
      `سينتقل ملف «${client.name}» مع ${caseCount} قضية وما يرتبط بها من وكالات ودفعات ومواعيد ومهام ومصروفات ومرفقات إلى السلة. يمكن استعادته لاحقاً.`,
      "نقل إلى السلة",
    );
    if (!confirmed) return;
    try {
      const remindersNeedRetry = await archiveRecord("client", clientId);
      setProfileId(null);
      setMessage(remindersNeedRetry ? "نُقل ملف الموكل إلى السلة؛ أبقينا معرّفات بعض التنبيهات لإعادة محاولة إلغائها." : "نُقل ملف الموكل وسجلاته إلى سلة المحذوفات.");
    } catch {
      setMessage("تعذر نقل ملف الموكل إلى السلة؛ بقيت سجلاته كما هي.");
    }
  }

  async function addCaseDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: CASE_FILE_TYPES, copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.size !== undefined && asset.size > MAX_CASE_FILE_SIZE) {
        await deleteTemporaryCacheFile(asset.uri); setMessage("الحد الأقصى للمرفق 8 ميغابايت."); return;
      }
      setCaseAttachments((current) => [...current, { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "application/octet-stream" }]);
      setMessage("");
    } catch { setMessage("تعذر اختيار المستند."); }
  }

  async function addCasePhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsMultipleSelection: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize !== undefined && asset.fileSize > MAX_CASE_FILE_SIZE) {
        await deleteTemporaryCacheFile(asset.uri); setMessage("الحد الأقصى للصورة 8 ميغابايت."); return;
      }
      setCaseAttachments((current) => [...current, { uri: asset.uri, name: asset.fileName ?? `مرفق-${Date.now()}.jpg`, mimeType: asset.mimeType ?? "image/jpeg" }]);
      setMessage("");
    } catch { setMessage("تعذر اختيار الصورة."); }
  }

  async function saveCase() {
    const fee = Number(fees || 0); const upfront = Number(advance || 0);
    if (!selectedClient || !caseTitle.trim()) { setMessage("اختر الموكل وأدخل عنوان القضية"); return; }
    if (!Number.isFinite(fee) || !Number.isFinite(upfront) || fee < 0 || upfront < 0 || upfront > fee) { setMessage("تأكد من المبالغ؛ السلفة لا تتجاوز إجمالي الأتعاب"); return; }
    if (upfront > 0 && !isValidISODate(advanceDate)) { setMessage("أدخل تاريخ قبض السلفة بصيغة سنة-شهر-يوم."); return; }
    const existing = editingCaseId ? data.cases.find((item) => item.id === editingCaseId) : undefined;
    const installments = editingCaseId ? data.payments.filter((payment) => payment.caseId === editingCaseId).reduce((sum, payment) => sum + payment.amount, 0) : 0;
    if (upfront + installments > fee) { setMessage("لا يمكن خفض الأتعاب عن مجموع السلفة والأقساط المسجلة."); return; }
    setBusy(true); setMessage("");
    const attachments: VaultFile[] = [];
    try {
      const id = existing?.id ?? createId("case");
      for (const draft of caseAttachments) {
        const info = await FileSystem.getInfoAsync(draft.uri);
        if (info.exists && info.size !== undefined && info.size > MAX_CASE_FILE_SIZE) throw new Error("الحد الأقصى للمرفق 8 ميغابايت.");
        const base64 = await FileSystem.readAsStringAsync(draft.uri, { encoding: FileSystem.EncodingType.Base64 });
        const encryptedFile = await encryptAttachment(base64, draft.name);
        attachments.push({ id: createId("file"), caseId: id, title: draft.name, mimeType: draft.mimeType, encryptedFile, createdAt: new Date().toISOString() });
      }
      const nextCase: LegalCase = {
        id, clientId: selectedClient, title: caseTitle.trim(), type: caseType.trim() || "عام", status,
        court: court.trim(), courtLevel: courtLevel.trim() || undefined, governorate: governorate.trim() || undefined, caseNumber: caseNumber.trim(), totalFees: fee, advancePayment: upfront,
        advancePaymentDate: upfront > 0 ? (existing?.advancePayment === upfront ? existing.advancePaymentDate ?? advanceDate : advanceDate) : undefined,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      const beforeAdvance = existing?.advancePayment ? { amount: existing.advancePayment, date: existing.advancePaymentDate ?? existing.createdAt.slice(0, 10) } : undefined;
      const afterAdvance = upfront ? { amount: upfront, date: nextCase.advancePaymentDate ?? advanceDate } : undefined;
      const audit = auditAdvanceChange(beforeAdvance, afterAdvance, id, id, selectedClient, existing ? "تعديل السلفة المرتبطة بالقضية" : undefined);
      await updateData((current) => addAuditEntry({
        ...current,
        cases: existing ? current.cases.map((item) => item.id === id ? nextCase : item) : [...current.cases, nextCase],
        files: attachments.length ? [...attachments, ...current.files] : current.files,
      }, audit));
      attachments.length = 0;
      await closeModal();
    } catch (error) {
      await Promise.all(attachments.map((file) => deleteEncryptedAttachment(file.encryptedFile)));
      await Promise.all(caseAttachments.map((file) => deleteTemporaryCacheFile(file.uri)));
      setCaseAttachments([]);
      setMessage(error instanceof Error ? error.message : "تعذر حفظ القضية أو تشفير المرفقات.");
    } finally { setBusy(false); }
  }

  async function openCaseFile(file: VaultFile) {
    if (Platform.OS === "web") { setMessage("فتح المرفقات متاح في تطبيق الهاتف؛ معاينة الويب للعرض فقط."); return; }
    try {
      const base64 = await decryptAttachment(file.encryptedFile);
      const path = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${createId("case-share")}-${file.title.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      try { await Sharing.shareAsync(path, { mimeType: file.mimeType, dialogTitle: file.title }); }
      finally { await deleteTemporaryCacheFile(path); }
    } catch { setMessage("تعذر فتح المرفق المشفر."); }
  }

  useEffect(() => {
    if (createCaseParam !== "1" || widgetRequestHandled.current) return;
    const timer = setTimeout(() => {
      if (widgetRequestHandled.current) return;
      widgetRequestHandled.current = true;
      setFilter("cases");
      if (data.clients.length) {
        setEditingCaseId(null); setCaseTitle(""); setCaseType(""); setCaseNumber(""); setCourt(""); setCourtLevel(""); setGovernorate(""); setStatus("قائمة");
        setFees(""); setAdvance(""); setAdvanceDate(new Date().toISOString().slice(0, 10)); setSelectedClient(data.clients[0].id); setCaseAttachments([]); setMessage(""); setModal("case");
      } else {
        setEditingClientId(null); setClientName(""); setPhone(""); setMessage("أضف موكلاً أولاً؛ بعدها يمكنك تسجيل القضية وربطها به."); setModal("client");
      }
      router.replace("/(tabs)/clients" as never);
    }, 0);
    return () => clearTimeout(timer);
  }, [createCaseParam, data.clients, router]);

  return <Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 28, gap: 16 }}>
    <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}><View><Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>الموكلون والقضايا</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 5 }}>{data.clients.length} موكل · {activeCases} قضية نشطة</Text></View><Pressable onPress={openNewClient} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: colors.tint, paddingVertical: 11, paddingHorizontal: 13, borderRadius: 13 }}><MaterialCommunityIcons name="account-plus-outline" color="#fff" size={18} /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>إضافة</Text></Pressable></View>
    <View style={{ flexDirection: "row-reverse", gap: 7 }}>{([{ id: "all", label: "الكل" }, { id: "clients", label: "الموكلون" }, { id: "cases", label: "القضايا" }] as const).map((item) => <Pressable key={item.id} onPress={() => setFilter(item.id)} style={{ paddingHorizontal: 15, paddingVertical: 9, borderRadius: 18, backgroundColor: filter === item.id ? colors.tint : colors.surface, borderColor: colors.border, borderWidth: 1 }}><Text style={{ color: filter === item.id ? "#fff" : colors.text, fontSize: 12, fontWeight: "700" }}>{item.label}</Text></Pressable>)}</View>
    {(filter === "all" || filter === "clients") && <View><SectionTitle title="ملفات الموكلين" action="إضافة موكل" onAction={openNewClient} />{data.clients.length ? <View style={{ gap: 9 }}>{data.clients.map((client) => { const clientCases = data.cases.filter((item) => item.clientId === client.id); const poaCount = data.powers.filter((item) => item.clientId === client.id).length; const due = clientCases.reduce((sum, item) => sum + remainingBalance(item, data.payments), 0); return <Card key={client.id} style={{ padding: 15 }}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}><Pressable onPress={() => setProfileId(client.id)} style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 12 }}><View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: `${colors.tint}16`, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name="account-outline" size={22} color={colors.tint} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "800", fontSize: 15 }}>{client.name}</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 3, fontSize: 12 }}>{client.phone || "لا يوجد رقم هاتف"}</Text></View><MaterialCommunityIcons name="chevron-left" size={21} color={colors.muted} /></Pressable><View style={{ flexDirection: "row-reverse", alignItems: "center" }}><Pressable onPress={() => openClientEdit(client.id)} accessibilityLabel="تعديل الموكل" hitSlop={8} style={{ padding: 7 }}><MaterialCommunityIcons name="pencil-outline" size={19} color={colors.tint} /></Pressable><Pressable onPress={() => void deleteClientRecord(client.id)} accessibilityLabel="حذف الموكل" hitSlop={8} style={{ padding: 7 }}><MaterialCommunityIcons name="delete-outline" size={19} color={colors.error} /></Pressable></View></View><View style={{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: 13, paddingTop: 11, flexDirection: "row-reverse", justifyContent: "space-between" }}><Text style={{ color: colors.muted, fontSize: 11 }}>{clientCases.length} قضايا · {poaCount} وكالات</Text><Text style={{ color: due ? colors.warning : colors.success, fontSize: 11, fontWeight: "700" }}>متبقي {fmt(due, data.currency)}</Text></View></Card>; })}</View> : <Card><EmptyState icon={<MaterialCommunityIcons name="account-multiple-outline" size={24} color={colors.muted} />} title="ابدأ بملف موكل" detail="احفظ الاسم ورقم الهاتف، ثم اربط به قضاياه ووكالاته." /></Card>}</View>}
    {(filter === "all" || filter === "cases") && <View><SectionTitle title="القضايا" action="إضافة قضية" onAction={() => { if (!data.clients.length) { setMessage("أضف موكلاً أولاً لربط القضية به"); openNewClient(); } else openNewCase(); }} />{data.cases.length ? <View style={{ gap: 9 }}>{data.cases.map((legalCase) => { const client = data.clients.find((item) => item.id === legalCase.clientId); const statusKey = paymentStatus(legalCase, data.payments); const attachments = data.files.filter((file) => file.caseId === legalCase.id); return <Card key={legalCase.id} style={{ padding: 15 }}><View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start" }}><View style={{ flex: 1, paddingLeft: 8 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "800", fontSize: 15 }}>{legalCase.title}</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 5, fontSize: 12 }}>{client?.name ?? "موكل"} · {legalCase.type}</Text></View><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 }}><Pill label={legalCase.status} color={legalCase.status === "منتهية" ? colors.success : colors.tint} /><Pressable onPress={() => openCaseEdit(legalCase.id)} accessibilityLabel="تعديل القضية" hitSlop={8} style={{ padding: 5 }}><MaterialCommunityIcons name="pencil-outline" size={19} color={colors.tint} /></Pressable><Pressable onPress={() => void deleteCaseRecord(legalCase)} accessibilityLabel="حذف القضية" hitSlop={8} style={{ padding: 5 }}><MaterialCommunityIcons name="delete-outline" size={19} color={colors.error} /></Pressable></View></View><View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginTop: 12 }}><Pill label={legalCase.caseNumber ? `رقم ${legalCase.caseNumber}` : "رقم غير مسجل"} /><Pill label={statusKey === "paid" ? "مدفوعة" : statusKey === "partial" ? "مدفوعة جزئياً" : "لم تدفع"} color={statusKey === "paid" ? colors.success : colors.warning} /></View><View style={{ marginTop: 11, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, flexDirection: "row-reverse", justifyContent: "space-between" }}><Text style={{ color: colors.muted, fontSize: 11 }}>{legalCase.court || "المحكمة غير محددة"}</Text><Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>المتبقي {fmt(remainingBalance(legalCase, data.payments), data.currency)}</Text></View>{legalCase.courtLevel || legalCase.governorate ? <Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 7 }}>{[legalCase.courtLevel, legalCase.governorate].filter(Boolean).join(" · ")}</Text> : null}{attachments.length ? <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginTop: 10 }}>{attachments.map((file) => <Pressable key={file.id} onPress={() => void openCaseFile(file)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: `${colors.tint}12` }}><MaterialCommunityIcons name="paperclip" size={15} color={colors.tint} /><Text numberOfLines={1} style={{ color: colors.tint, fontSize: 11, maxWidth: 170 }}>{file.title}</Text></Pressable>)}</View> : null}<CaseTimelinePanel data={data} caseId={legalCase.id} /><CaseSessionHistory data={data} caseId={legalCase.id} /></Card>; })}</View> : <Card><EmptyState icon={<MaterialCommunityIcons name="briefcase-outline" size={24} color={colors.muted} />} title="لا توجد قضايا بعد" detail="أضف قضية واربطها بأحد الموكلين لتتبع حالتها وأتعابها." /></Card>}</View>}
  </ScrollView>
  <Modal visible={!!profileClient} transparent animationType="slide" onRequestClose={() => setProfileId(null)}><View style={{ flex: 1, backgroundColor: "#0007", justifyContent: "flex-end" }}><View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" }}><ScrollView keyboardShouldPersistTaps="handled"><View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 16 }}><View><Text style={{ color: colors.text, fontWeight: "800", fontSize: 19, textAlign: "right" }}>{profileClient?.name}</Text><Text style={{ color: colors.muted, marginTop: 4, textAlign: "right" }}>{profileClient?.phone || "لا يوجد رقم هاتف"}</Text></View><View style={{ flexDirection: "row-reverse", gap: 10 }}><Pressable onPress={() => profileClient && openClientEdit(profileClient.id)} accessibilityLabel="تعديل بيانات الموكل"><MaterialCommunityIcons name="pencil-outline" size={22} color={colors.tint} /></Pressable><Pressable onPress={() => setProfileId(null)}><MaterialCommunityIcons name="close" size={23} color={colors.muted} /></Pressable></View></View><SectionTitle title={`القضايا (${profileCases.length})`} />{profileCases.length ? profileCases.map((item) => <Card key={item.id} style={{ marginBottom: 8 }}><View style={{ flexDirection: "row-reverse", justifyContent: "space-between", gap: 8 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "800", flex: 1 }}>{item.title} · {item.type}</Text><View style={{ flexDirection: "row-reverse", gap: 9 }}><Pressable onPress={() => { setProfileId(null); openCaseEdit(item.id); }} accessibilityLabel="تعديل القضية"><MaterialCommunityIcons name="pencil-outline" size={18} color={colors.tint} /></Pressable><Pressable onPress={() => void deleteCaseRecord(item)} accessibilityLabel="حذف القضية"><MaterialCommunityIcons name="delete-outline" size={18} color={colors.error} /></Pressable></View></View><Text style={{ color: colors.muted, textAlign: "right", marginTop: 5, fontSize: 12 }}>{item.status} · رقم {item.caseNumber || "—"} · إجمالي الأتعاب {fmt(item.totalFees, data.currency)}</Text><Text style={{ color: colors.warning, textAlign: "right", marginTop: 5, fontSize: 12 }}>متبقي {fmt(remainingBalance(item, data.payments), data.currency)}</Text></Card>) : <Text style={{ color: colors.muted, textAlign: "right", marginBottom: 12 }}>لا توجد قضايا مسجلة.</Text>}<SectionTitle title={`الوكالات (${profilePowers.length})`} />{profilePowers.length ? profilePowers.map((item) => <Text key={item.id} style={{ color: colors.text, textAlign: "right", paddingVertical: 7 }}>رقم {item.number} · {item.date} · {item.capacity}</Text>) : <Text style={{ color: colors.muted, textAlign: "right", marginBottom: 12 }}>لا توجد وكالات مسجلة.</Text>}<SectionTitle title={`الدفعات (${profilePayments.length})`} />{profilePayments.length ? profilePayments.map((payment) => <Text key={payment.id} style={{ color: colors.text, textAlign: "right", paddingVertical: 6 }}>{payment.date} · {fmt(payment.amount, data.currency)} · {profileCases.find((item) => item.id === payment.caseId)?.title}</Text>) : <Text style={{ color: colors.muted, textAlign: "right", marginBottom: 12 }}>لا توجد دفعات مسجلة.</Text>}<View style={{ marginTop: 16 }}><Button title="إضافة قضية لهذا الموكل" onPress={() => { if (profileClient) openNewCase(profileClient.id); setProfileId(null); }} /></View></ScrollView></View></View></Modal>
  <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => void closeModal()}><KeyboardAvoidingSheet><View style={{ backgroundColor: colors.surface, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "92%" }}><ScrollView keyboardShouldPersistTaps="handled"><View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 16 }}><Text style={{ color: colors.text, fontWeight: "800", fontSize: 19 }}>{modal === "case" ? editingCaseId ? "تعديل القضية" : "قضية جديدة" : editingClientId ? "تعديل بيانات الموكل" : "ملف موكل جديد"}</Text><Pressable onPress={() => void closeModal()}><MaterialCommunityIcons name="close" size={23} color={colors.muted} /></Pressable></View>
    {modal === "client" ? <><Field label="اسم الموكل" value={clientName} onChangeText={setClientName} placeholder="الاسم الكامل" returnKeyType="next" /><Field label="رقم الهاتف" value={phone} onChangeText={setPhone} placeholder="05xxxxxxxx" keyboardType="phone-pad" returnKeyType="done" /><Button title={busy ? "جارٍ الحفظ…" : editingClientId ? "حفظ التعديلات" : "حفظ الموكل"} onPress={() => void saveClient()} disabled={busy} /></> : <><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>ربط بموكل</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row-reverse", paddingBottom: 12 }}>{data.clients.map((client) => <Pressable key={client.id} onPress={() => setSelectedClient(client.id)} style={{ padding: 10, borderRadius: 12, backgroundColor: selectedClient === client.id ? `${colors.tint}20` : colors.background, borderWidth: 1, borderColor: selectedClient === client.id ? colors.tint : colors.border }}><Text style={{ color: colors.text }}>{client.name}</Text></Pressable>)}</ScrollView><Field label="عنوان القضية" value={caseTitle} onChangeText={setCaseTitle} placeholder="مثال: مطالبة مالية" returnKeyType="next" /><Field label="نوع القضية" value={caseType} onChangeText={setCaseType} placeholder="مدني، تجاري، عمالي…" returnKeyType="next" /><View style={{ flexDirection: "row-reverse", gap: 10 }}><View style={{ flex: 1 }}><Field label="رقم القضية" value={caseNumber} onChangeText={setCaseNumber} placeholder="اختياري" /></View><View style={{ flex: 1 }}><Field label="المحكمة" value={court} onChangeText={setCourt} placeholder="اختياري" /></View></View><Field label="المستوى القضائي أو نوع المحكمة" value={courtLevel} onChangeText={setCourtLevel} placeholder="صلح، بداية، استئناف، نقض…" /><View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{SYRIA_COURT_LEVEL_SUGGESTIONS.map((item) => <Pressable key={item} onPress={() => setCourtLevel(item)} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: courtLevel === item ? `${colors.tint}20` : colors.background, borderWidth: 1, borderColor: courtLevel === item ? colors.tint : colors.border }}><Text style={{ color: courtLevel === item ? colors.tint : colors.text, fontSize: 10 }}>{item}</Text></Pressable>)}</View><Field label="المحافظة" value={governorate} onChangeText={setGovernorate} placeholder="مثال: دمشق" /><View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{SYRIA_GOVERNORATE_SUGGESTIONS.map((item) => <Pressable key={item} onPress={() => setGovernorate(item)} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: governorate === item ? `${colors.tint}20` : colors.background, borderWidth: 1, borderColor: governorate === item ? colors.tint : colors.border }}><Text style={{ color: governorate === item ? colors.tint : colors.text, fontSize: 10 }}>{item}</Text></Pressable>)}</View><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 16, marginBottom: 10 }}>{SYRIA_NOTICE}</Text><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>حالة القضية</Text><View style={{ flexDirection: "row-reverse", gap: 7, marginBottom: 13 }}>{["قائمة", "قيد النظر", "منتهية"].map((item) => <Pressable key={item} onPress={() => setStatus(item)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: status === item ? colors.tint : colors.background }}><Text style={{ color: status === item ? "#fff" : colors.text, fontSize: 12 }}>{item}</Text></Pressable>)}</View><View style={{ flexDirection: "row-reverse", gap: 10 }}><View style={{ flex: 1 }}><Field label="إجمالي الأتعاب" value={fees} onChangeText={setFees} placeholder="0" keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><Field label="السلفة المدفوعة" value={advance} onChangeText={setAdvance} placeholder="0" keyboardType="decimal-pad" /></View></View><Field label="تاريخ قبض السلفة" value={advanceDate} onChangeText={setAdvanceDate} placeholder="YYYY-MM-DD" />
    <View style={{ marginTop: 4, marginBottom: 9 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>مستندات القضية (اختياري)</Text><View style={{ flexDirection: "row-reverse", gap: 8 }}><Button title="اختيار صورة" onPress={() => void addCasePhoto()} secondary icon={<MaterialCommunityIcons name="image-outline" size={17} color={colors.text} />} /><Button title="PDF أو Word" onPress={() => void addCaseDocument()} secondary icon={<MaterialCommunityIcons name="file-upload-outline" size={17} color={colors.text} />} /></View><Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, marginTop: 6 }}>تُشفّر المرفقات على الجهاز، بحد 8 ميغابايت لكل ملف.</Text></View>
    {editingCaseFiles.length ? <View style={{ gap: 5, marginBottom: 8 }}><Text style={{ color: colors.muted, textAlign: "right", fontSize: 11 }}>مرفقات محفوظة</Text>{editingCaseFiles.map((file) => <Pressable key={file.id} onPress={() => void openCaseFile(file)} style={{ flexDirection: "row-reverse", gap: 6, padding: 7 }}><MaterialCommunityIcons name="lock-outline" size={15} color={colors.tint} /><Text style={{ color: colors.tint, fontSize: 11 }}>{file.title}</Text></Pressable>)}</View> : null}
    {caseAttachments.map((file, index) => <View key={`${file.uri}-${index}`} style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 8, borderRadius: 10, backgroundColor: colors.background, marginBottom: 5 }}><Text numberOfLines={1} style={{ color: colors.text, flex: 1, textAlign: "right", fontSize: 11 }}>{file.name}</Text><Pressable onPress={() => { void deleteTemporaryCacheFile(file.uri); setCaseAttachments((current) => current.filter((_, i) => i !== index)); }} accessibilityLabel="إزالة المرفق"><MaterialCommunityIcons name="close-circle-outline" size={19} color={colors.error} /></Pressable></View>)}
    <Button title={busy ? "جارٍ حفظ القضية ومرفقاتها…" : editingCaseId ? "حفظ تعديلات القضية" : "حفظ القضية"} onPress={() => void saveCase()} disabled={busy} />{message ? <Text style={{ color: colors.error, textAlign: "right", marginTop: 12 }}>{message}</Text> : null}</>}
    {message && modal === "client" ? <Text style={{ color: colors.error, textAlign: "right", marginTop: 12 }}>{message}</Text> : null}
  </ScrollView></View></KeyboardAvoidingSheet></Modal>
  </Page>;
}
