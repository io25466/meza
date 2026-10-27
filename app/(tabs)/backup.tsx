import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { AppText as Text } from "@/components/app-text";
import { Button, Card, Field, Page, SectionTitle } from "@/components/ui";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { confirmDestructiveAction } from "@/lib/confirm";
import { cancelScheduledReminders, prepareAppointmentReminderUpdate, todayISO } from "@/lib/notifications";
import { createEncryptedVaultBackup, backupFileName, discardRestoredVaultFiles, restoreEncryptedVaultBackup } from "@/lib/vault-backup";
import { deleteEncryptedAttachment, deleteTemporaryCacheFile } from "@/lib/secure-vault";
import { scheduleTaskDeadline } from "@/lib/task-notifications";
import type { AppData } from "@/lib/models";

const MAX_ARCHIVE_SIZE = 160 * 1024 * 1024;

function allFilePaths(data: AppData): Set<string> {
  return new Set([...data.files, ...data.trash.flatMap((item) => item.snapshot.files ?? [])].map((file) => file.encryptedFile).filter(Boolean));
}

function allReminderIds(data: AppData): string[] {
  return [...data.appointments.flatMap((item) => item.reminders), ...data.tasks.flatMap((item) => item.reminderIds ?? []), ...(data.orphanReminderIds ?? [])];
}

export default function BackupScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, updateData, replaceAllData } = useAppData();
  const [exportPass, setExportPass] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [importPass, setImportPass] = useState("");
  const [selectedUri, setSelectedUri] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function exportBackup() {
    if (Platform.OS === "web") { setNotice("النسخة الاحتياطية متاحة داخل تطبيق الهاتف فقط."); return; }
    if (exportPass.length < 12) { setNotice("استخدم كلمة استعادة من 12 محرفاً على الأقل."); return; }
    if (exportPass !== exportConfirm) { setNotice("تأكيد كلمة الاستعادة لا يطابقها."); return; }
    setBusy(true); setNotice("");
    let uri = "";
    try {
      const { archive, exportedAt } = await createEncryptedVaultBackup(data, exportPass);
      uri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}${backupFileName()}`;
      await FileSystem.writeAsStringAsync(uri, archive, { encoding: FileSystem.EncodingType.UTF8 });
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || (info.size ?? 0) > MAX_ARCHIVE_SIZE) throw new Error("حجم النسخة تجاوز الحد المتاح للمشاركة.");
      if (!(await Sharing.isAvailableAsync())) throw new Error("مشاركة الملفات غير متاحة على هذا الجهاز.");
      await Sharing.shareAsync(uri, { mimeType: "application/octet-stream", dialogTitle: "حفظ نسخة ميزان المشفرة" });
      await updateData((current) => ({ ...current, lastBackupAt: exportedAt }));
      setNotice("جُهّز ملف نسخة ميزان المشفر. اختر «حفظ في الملفات» أو وسيطاً آمناً من نافذة المشاركة. لا تُرسل كلمة الاستعادة مع الملف.");
      setExportPass(""); setExportConfirm("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تجهيز النسخة الاحتياطية.");
    } finally {
      if (uri) await deleteTemporaryCacheFile(uri);
      setBusy(false);
    }
  }

  async function chooseBackup() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "application/octet-stream", "*/*"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.size !== undefined && asset.size > MAX_ARCHIVE_SIZE) {
        await deleteTemporaryCacheFile(asset.uri);
        setNotice("الحد الأقصى لحجم ملف النسخة 160 ميغابايت.");
        return;
      }
      if (selectedUri) await deleteTemporaryCacheFile(selectedUri);
      setSelectedUri(asset.uri); setSelectedName(asset.name); setImportPass(""); setNotice("");
    } catch { setNotice("تعذر اختيار ملف النسخة."); }
  }

  async function restoreBackup() {
    if (Platform.OS === "web") { setNotice("استعادة النسخة متاحة داخل تطبيق الهاتف فقط."); return; }
    if (!selectedUri) { setNotice("اختر ملف النسخة أولاً."); return; }
    if (importPass.length < 12) { setNotice("أدخل كلمة الاستعادة نفسها التي استُخدمت عند إنشاء الملف."); return; }
    setBusy(true); setNotice("");
    let restored: Awaited<ReturnType<typeof restoreEncryptedVaultBackup>> | null = null;
    try {
      const info = await FileSystem.getInfoAsync(selectedUri);
      if (!info.exists || (info.size ?? 0) > MAX_ARCHIVE_SIZE) throw new Error("ملف النسخة مفقود أو أكبر من الحد المدعوم.");
      const archive = await FileSystem.readAsStringAsync(selectedUri, { encoding: FileSystem.EncodingType.UTF8 });
      restored = await restoreEncryptedVaultBackup(archive, importPass);
      const yes = await confirmDestructiveAction("استبدال بيانات هذا الجهاز؟", `سيُستبدل محتوى ميزان الحالي بنسخة «${selectedName}» بعد التحقق من كلمة الاستعادة. ستُحفظ المرفقات مشفرة بمفتاح هذا الجهاز. لا يمكن التراجع إلا بوجود نسخة احتياطية أخرى.`);
      if (!yes) { await discardRestoredVaultFiles(restored.data); restored = null; return; }

      const oldReminderIds = allReminderIds(data);
      const oldFilePaths = allFilePaths(data);
      let imported: AppData = restored.data;
      const preferences = { reminder24hEnabled: imported.reminder24hEnabled, reminder1hEnabled: imported.reminder1hEnabled };
      const appointmentPlan = await prepareAppointmentReminderUpdate(imported.appointments, preferences);
      imported = { ...imported, appointments: appointmentPlan.appointments };
      const newReminderIds = [...appointmentPlan.newIds, ...appointmentPlan.orphanIds];
      const today = todayISO();
      const tasks = [];
      for (const task of imported.tasks) {
        if (task.status === "done" || task.dueDate < today) { tasks.push({ ...task, reminderIds: [] }); continue; }
        try {
          const scheduled = await scheduleTaskDeadline(task);
          tasks.push({ ...task, reminderIds: scheduled.ids }); newReminderIds.push(...scheduled.ids);
        } catch (error) {
          const orphanIds = (error as Error & { orphanReminderIds?: string[] }).orphanReminderIds ?? [];
          tasks.push({ ...task, reminderIds: orphanIds }); newReminderIds.push(...orphanIds);
        }
      }
      imported = { ...imported, tasks, orphanReminderIds: [...new Set([...(imported.orphanReminderIds ?? []), ...oldReminderIds])] };
      try {
        await replaceAllData(imported);
      } catch (error) {
        await cancelScheduledReminders(newReminderIds);
        await discardRestoredVaultFiles(restored.data);
        restored = null;
        throw error;
      }
      restored = null;
      const failedOldIds = await cancelScheduledReminders(oldReminderIds);
      try {
        await updateData((current) => ({ ...current, orphanReminderIds: [...new Set([...(current.orphanReminderIds ?? []).filter((id) => !oldReminderIds.includes(id)), ...failedOldIds])] }));
      } catch { /* IDs remain persisted so a later cleanup can retry them. */ }
      for (const path of oldFilePaths) await deleteEncryptedAttachment(path).catch(() => undefined);
      setSelectedUri(""); setSelectedName(""); setImportPass("");
      setNotice(`تمت استعادة ${imported.clients.length} موكل و${imported.cases.length} قضية من النسخة. ${appointmentPlan.enabled ? "أُعيدت جدولة التذكيرات القادمة." : "لم تُجدول بعض المواعيد؛ تحقق من إذن الإشعارات."} المهام القديمة المستحقة لا تُرسل تنبيهاً فورياً أثناء الاستعادة.`);
    } catch (error) {
      if (restored) await discardRestoredVaultFiles(restored.data);
      setNotice(error instanceof Error ? error.message : "تعذر استعادة النسخة؛ لم تُستبدل البيانات الحالية ما لم يظهر تأكيد النجاح.");
    } finally { setBusy(false); }
  }

  return <Page><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 36, gap: 16 }}>
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
      <Pressable onPress={() => router.back()} accessibilityLabel="رجوع" style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}><MaterialCommunityIcons name="arrow-right" size={21} color={colors.text} /></Pressable>
      <View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>النسخ والاستعادة</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }}>نسخة مشفرة مستقلة عن PIN الجهاز</Text></View>
    </View>
    {notice ? <Card style={{ borderColor: colors.tint }}><Text style={{ color: colors.text, textAlign: "right", lineHeight: 23, fontSize: 12 }}>{notice}</Text></Card> : null}
    <Card>
      <SectionTitle title="إنشاء نسخة احتياطية" />
      <Text style={{ color: colors.muted, textAlign: "right", lineHeight: 21, fontSize: 12, marginBottom: 12 }}>تتضمن السجلات والمرفقات النشطة وسلة المحذوفات. اختر كلمة استعادة لا تقل عن 12 محرفاً، واكتبها في مكان آمن؛ لا يمكن استعادتها إذا نُسيت. الملف المشفّر لا يُرسل إلى خادم ميزان.</Text>
      <Field label="كلمة الاستعادة" value={exportPass} onChangeText={setExportPass} placeholder="12 محرفاً على الأقل" secureTextEntry autoCapitalize="none" editable={Platform.OS !== "web"} />
      <Field label="تأكيد كلمة الاستعادة" value={exportConfirm} onChangeText={setExportConfirm} placeholder="أعد كتابتها" secureTextEntry autoCapitalize="none" editable={Platform.OS !== "web"} />
      <Button title={busy ? "جارٍ تشفير الخزنة…" : "إنشاء ومشاركة النسخة"} onPress={() => void exportBackup()} disabled={busy || Platform.OS === "web"} icon={<MaterialCommunityIcons name="shield-lock-outline" size={17} color="#fff" />} />
      {data.lastBackupAt ? <Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, marginTop: 10 }}>آخر ملف جرى تجهيزه: {new Date(data.lastBackupAt).toLocaleString("ar-SY")}</Text> : null}
    </Card>
    <Card>
      <SectionTitle title="استعادة من نسخة" />
      <Text style={{ color: colors.warning, textAlign: "right", lineHeight: 21, fontSize: 12, marginBottom: 12 }}>الاستعادة تستبدل البيانات الحالية فقط بعد فك التشفير بنجاح وتأكيدك؛ لن تمس ملفات Android أو غيرها. احفظ نسخة من الحالة الحالية أولاً إذا احتجت إليها.</Text>
      <Button title={selectedName || "اختيار ملف .mizanbackup"} onPress={() => void chooseBackup()} secondary disabled={busy || Platform.OS === "web"} icon={<MaterialCommunityIcons name="file-upload-outline" size={17} color={colors.text} />} />
      {selectedUri ? <View style={{ marginTop: 12 }}><Field label="كلمة استعادة النسخة" value={importPass} onChangeText={setImportPass} placeholder="أدخل كلمة الاستعادة" secureTextEntry autoCapitalize="none" editable={Platform.OS !== "web"} /><Button title={busy ? "جارٍ التحقق والاستعادة…" : "تحقق واستعد الخزنة"} onPress={() => void restoreBackup()} disabled={busy || Platform.OS === "web"} /></View> : null}
    </Card>
    <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 18, fontSize: 10 }}>لا تضع ملف النسخة أو كلمة الاستعادة في خدمة سحابية لا تثق بها. اختبار الاستعادة الفعلي على جهاز آخر مهم قبل الاعتماد على النسخة.</Text>
  </ScrollView></Page>;
}
