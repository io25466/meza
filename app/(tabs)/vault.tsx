import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAvoidingSheet } from "@/components/keyboard-avoiding-sheet";
import { AppText as Text } from "@/components/app-text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { createId, isValidISODate, type AgencyType, type PowerOfAttorney, type VaultFile } from "@/lib/models";
import { decryptAttachment, deleteTemporaryCacheFile, encryptAttachment } from "@/lib/secure-vault";
import { todayISO } from "@/lib/notifications";
import { confirmDestructiveAction } from "@/lib/confirm";
import { moveRecordToTrash } from "@/lib/trash";
import { Button, Card, EmptyState, Field, Page, Pill, SectionTitle } from "@/components/ui";

const supportedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "image/jpeg", "image/png", "image/webp"];
const agencyTypes: { id: AgencyType; label: string }[] = [
  { id: "general", label: "عام" },
  { id: "special", label: "خاص" },
  { id: "sharia", label: "شرعي" },
];
const agencyTypeLabel = (type?: AgencyType) => agencyTypes.find((item) => item.id === type)?.label ?? "غير محدد";

async function protectFile(uri: string, name: string, mimeType: string): Promise<VaultFile> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && info.size !== undefined && info.size > 8 * 1024 * 1024) throw new Error("file_too_large");
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const encryptedFile = await encryptAttachment(base64, name);
    return { id: createId("file"), title: name, mimeType, encryptedFile, createdAt: new Date().toISOString() };
  } finally {
    await deleteTemporaryCacheFile(uri);
  }
}

export default function VaultScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, updateData } = useAppData();
  const [modal, setModal] = useState(false);
  const [editingPowerId, setEditingPowerId] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayISO());
  const [capacity, setCapacity] = useState("");
  const [agencyType, setAgencyType] = useState<AgencyType>("general");
  const [clientId, setClientId] = useState("");
  const [fileId, setFileId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function openNewAgency() {
    if (!data.clients.length) { setNotice("أضف ملف موكل أولاً قبل تسجيل الوكالة."); return; }
    setEditingPowerId(null);
    setClientId(data.clients[0]?.id ?? "");
    setNumber("");
    setDate(todayISO());
    setCapacity("");
    setAgencyType("general");
    setFileId("");
    setNotice("");
    setModal(true);
  }

  function openAgencyEdit(power: PowerOfAttorney) {
    setEditingPowerId(power.id);
    setClientId(power.clientId);
    setNumber(power.number);
    setDate(power.date);
    setCapacity(power.capacity);
    setAgencyType(power.agencyType ?? "general");
    setFileId(power.fileId ?? "");
    setNotice("");
    setModal(true);
  }

  async function savePower() {
    if (!clientId || !number.trim() || !capacity.trim() || !isValidISODate(date)) {
      setNotice("اختر موكلاً وأدخل رقم الوكالة وبيان الصفة وتاريخاً صحيحاً.");
      return;
    }
    const existing = editingPowerId ? data.powers.find((item) => item.id === editingPowerId) : undefined;
    const power: PowerOfAttorney = {
      id: existing?.id ?? createId("poa"),
      clientId,
      number: number.trim(),
      date,
      capacity: capacity.trim(),
      agencyType,
      fileId: fileId || undefined,
    };
    try {
      await updateData((current) => ({
        ...current,
        powers: existing ? current.powers.map((item) => item.id === existing.id ? power : item) : [power, ...current.powers],
      }));
      setModal(false);
      setNotice(existing ? "تم تحديث بيانات الوكالة." : "تم تسجيل الوكالة.");
    } catch {
      setNotice("تعذر حفظ بيانات الوكالة في الخزنة.");
    }
  }

  async function deletePower(power: PowerOfAttorney) {
    const confirmed = await confirmDestructiveAction(
      "نقل الوكالة إلى سلة المحذوفات؟",
      `سينتقل سجل الوكالة رقم ${power.number} إلى السلة ويمكن استعادته. سيبقى أي مستند مرتبط بها محفوظاً في الخزنة.`,
      "نقل إلى السلة",
    );
    if (!confirmed) return;
    try {
      await updateData((current) => moveRecordToTrash(current, "power", power.id).data);
      setNotice(`نُقل سجل الوكالة رقم ${power.number} إلى سلة المحذوفات.`);
    } catch {
      setNotice("تعذر نقل سجل الوكالة إلى السلة.");
    }
  }

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: supportedTypes, copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setBusy(true);
      const file = await protectFile(asset.uri, asset.name, asset.mimeType ?? "application/octet-stream");
      await updateData((current) => ({ ...current, files: [file, ...current.files] }));
      setNotice(`تم تشفير «${asset.name}» وحفظه على هذا الجهاز.`);
    } catch (error) {
      setNotice(error instanceof Error && error.message === "file_too_large" ? "الحد الأقصى للملف 8 ميغابايت." : "تعذر استيراد الملف. تأكد من صلاحيات الوصول ومساحة التخزين.");
    } finally { setBusy(false); }
  }

  async function scanPage() {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setNotice("اسمح باستخدام الكاميرا لتصوير المستند."); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.84, allowsEditing: false });
      if (result.canceled || !result.assets[0]) return;
      setBusy(true);
      const image = result.assets[0];
      try {
        const base64 = await FileSystem.readAsStringAsync(image.uri, { encoding: FileSystem.EncodingType.Base64 });
        const pdf = await Print.printToFileAsync({ html: `<html><body style="margin:0"><img style="width:100%;height:auto" src="data:image/jpeg;base64,${base64}" /></body></html>` });
        const file = await protectFile(pdf.uri, `مستند-${todayISO()}.pdf`, "application/pdf");
        await updateData((current) => ({ ...current, files: [file, ...current.files] }));
        setNotice("تم تصوير الصفحة وتحويلها إلى PDF مشفر وحفظها في الخزنة.");
      } finally {
        await deleteTemporaryCacheFile(image.uri);
      }
    } catch {
      setNotice("تعذر تصوير المستند أو إنشاء ملف PDF.");
    } finally { setBusy(false); }
  }

  async function openFile(file: VaultFile) {
    if (Platform.OS === "web") { setNotice("فتح الملفات متاح داخل تطبيق الهاتف. معاينة الويب للعرض فقط."); return; }
    try {
      const base64 = await decryptAttachment(file.encryptedFile);
      const safeName = file.title.replace(/[^a-zA-Z0-9._-\u0600-\u06FF]/g, "_");
      const path = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${createId("share")}-${safeName}`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      try {
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: file.mimeType, dialogTitle: file.title });
        else setNotice("تعذر فتح قائمة المشاركة على هذا الجهاز.");
      } finally {
        await deleteTemporaryCacheFile(path);
      }
    } catch { setNotice("تعذر فك تشفير الملف أو فتحه."); }
  }

  return <Page>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 17 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 11 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="رجوع" style={{ width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><MaterialCommunityIcons name="arrow-right" size={21} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>الخزنة الرقمية</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }}>وكالات ووثائق مشفرة محلياً</Text></View>
      </View>
      <View style={{ flexDirection: "row-reverse", gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="استيراد PDF أو Word" onPress={() => void pickDocument()} secondary icon={<MaterialCommunityIcons name="file-upload-outline" size={17} color={colors.text} />} /></View>
        <View style={{ flex: 1 }}><Button title="تصوير مستند" onPress={() => void scanPage()} icon={<MaterialCommunityIcons name="camera-outline" size={17} color="#fff" />} /></View>
      </View>
      {busy ? <Text style={{ color: colors.tint, textAlign: "right" }}>جارٍ التشفير والحفظ…</Text> : null}
      {notice ? <Pressable onPress={() => setNotice("")} style={{ padding: 12, borderRadius: 12, backgroundColor: `${colors.tint}12` }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 12 }}>{notice}</Text></Pressable> : null}

      <View>
        <SectionTitle title="سجل الوكالات" action="إضافة وكالة" onAction={openNewAgency} />
        {data.powers.length ? <View style={{ gap: 9 }}>{data.powers.map((power) => {
          const client = data.clients.find((item) => item.id === power.clientId);
          const file = data.files.find((item) => item.id === power.fileId);
          return <Card key={power.id} style={{ padding: 14 }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.tint}16` }}><MaterialCommunityIcons name="file-certificate-outline" size={21} color={colors.tint} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, textAlign: "right", fontSize: 14, fontWeight: "800" }}>وكالة رقم {power.number}</Text>
                <Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }}>{client?.name ?? "موكل"} · {power.date}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 7 }}><Pill label={agencyTypeLabel(power.agencyType)} /><View style={{ flexDirection: "row-reverse", gap: 7 }}>
                <Pressable onPress={() => openAgencyEdit(power)} accessibilityLabel="تعديل الوكالة" hitSlop={8} style={{ padding: 5 }}><MaterialCommunityIcons name="pencil-outline" size={18} color={colors.tint} /></Pressable>
                <Pressable onPress={() => void deletePower(power)} accessibilityLabel="حذف الوكالة" hitSlop={8} style={{ padding: 5 }}><MaterialCommunityIcons name="delete-outline" size={18} color={colors.error} /></Pressable>
              </View></View>
            </View>
            <Text style={{ color: colors.muted, textAlign: "right", fontSize: 12, marginTop: 10 }}>{power.capacity}</Text>
            {file ? <Pressable onPress={() => void openFile(file)} style={{ marginTop: 11, alignSelf: "flex-start", flexDirection: "row-reverse", gap: 5 }}><MaterialCommunityIcons name="paperclip" size={16} color={colors.tint} /><Text style={{ color: colors.tint, fontSize: 12 }}>{file.title}</Text></Pressable> : null}
          </Card>;
        })}</View> : <Card><EmptyState icon={<MaterialCommunityIcons name="file-lock-outline" size={24} color={colors.muted} />} title="سجّل وكالة موكلك" detail="احفظ رقم الوكالة وتاريخها ونوعها، واربطها بملف الموكل." /></Card>}
      </View>

      <View>
        <SectionTitle title="الملفات المشفرة" />
        {data.files.length ? <View style={{ gap: 8 }}>{data.files.map((file) => <Pressable key={file.id} onPress={() => void openFile(file)} accessibilityLabel={`فتح الملف ${file.title}`}>
          <Card style={{ flexDirection: "row-reverse", alignItems: "center", gap: 11, padding: 13 }}><MaterialCommunityIcons name={file.mimeType === "application/pdf" ? "file-pdf-box" : "file-document-outline"} size={24} color={colors.tint} /><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.text, textAlign: "right", fontWeight: "700" }}>{file.title}</Text><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 3 }}>مشفّر · {new Date(file.createdAt).toLocaleDateString("ar-SA")}</Text></View><MaterialCommunityIcons name="share-variant-outline" size={17} color={colors.muted} /></Card>
        </Pressable>)}</View> : <Card><EmptyState icon={<MaterialCommunityIcons name="folder-lock-outline" size={24} color={colors.muted} />} title="الخزنة فارغة" detail="استورد مستنداً أو التقط صورة لتحويلها إلى PDF مشفر على جهازك." /></Card>}
      </View>
      <Text style={{ color: colors.muted, textAlign: "center", fontSize: 11, lineHeight: 18 }}>عند مشاركة ملف، يُنشأ مؤقتاً بنسخة غير مشفرة لتطبيق المشاركة الذي تختاره.</Text>
    </ScrollView>

    <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
      <KeyboardAvoidingSheet><View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%" }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 16 }}><Text style={{ color: colors.text, fontWeight: "800", fontSize: 19 }}>{editingPowerId ? "تعديل الوكالة" : "تسجيل وكالة"}</Text><Pressable onPress={() => setModal(false)} accessibilityLabel="إغلاق"><MaterialCommunityIcons name="close" size={22} color={colors.muted} /></Pressable></View>
          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>الموكل</Text>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>{data.clients.map((client) => <Pressable key={client.id} onPress={() => setClientId(client.id)} style={{ padding: 10, borderRadius: 12, borderWidth: 1, borderColor: clientId === client.id ? colors.tint : colors.border, backgroundColor: clientId === client.id ? `${colors.tint}18` : colors.background }}><Text style={{ color: colors.text, fontSize: 12 }}>{client.name}</Text></Pressable>)}</View>
          <Field label="رقم الوكالة" value={number} onChangeText={setNumber} placeholder="رقم الوكالة" />
          <Field label="تاريخها" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>نوع الوكالة</Text>
          <View style={{ flexDirection: "row-reverse", gap: 8, marginBottom: 13 }}>{agencyTypes.map((type) => <Pressable key={type.id} onPress={() => setAgencyType(type.id)} style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: agencyType === type.id ? colors.tint : colors.border, backgroundColor: agencyType === type.id ? `${colors.tint}18` : colors.background }}><Text style={{ color: agencyType === type.id ? colors.tint : colors.text, fontWeight: "700" }}>{type.label}</Text></Pressable>)}</View>
          <Field label="بيان الصفة" value={capacity} onChangeText={setCapacity} placeholder="وكيل، ممثل، محامٍ…" />
          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>المستند المرتبط (اختياري)</Text>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
            <Pressable onPress={() => setFileId("")} style={{ padding: 9, borderRadius: 12, backgroundColor: !fileId ? colors.tint : colors.background }}><Text style={{ color: !fileId ? "#fff" : colors.text, fontSize: 11 }}>بدون مرفق</Text></Pressable>
            {data.files.map((file) => <Pressable key={file.id} onPress={() => setFileId(file.id)} style={{ padding: 9, borderRadius: 12, backgroundColor: fileId === file.id ? colors.tint : colors.background, borderWidth: 1, borderColor: fileId === file.id ? colors.tint : colors.border }}><Text numberOfLines={1} style={{ color: fileId === file.id ? "#fff" : colors.text, maxWidth: 160, fontSize: 11 }}>{file.title}</Text></Pressable>)}
          </View>
          <Button title={editingPowerId ? "حفظ تعديلات الوكالة" : "حفظ الوكالة"} onPress={() => void savePower()} />
        </ScrollView>
      </View></KeyboardAvoidingSheet>
    </Modal>
  </Page>;
}
