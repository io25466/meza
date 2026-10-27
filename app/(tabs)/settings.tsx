import { useState } from "react";
import { Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/app-text";
import { Button, Card, Field, Page, SectionTitle } from "@/components/ui";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { useThemeContext } from "@/lib/theme-provider";
import { cancelScheduledReminders, prepareAppointmentReminderUpdate } from "@/lib/notifications";

const currencies = ["ل.س جديدة", "ل.س قديمة", "ر.س", "د.إ", "د.ك", "ر.ق", "د.ب", "ر.ع", "ج.م", "د.أ", "USD", "EUR"];

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, updateData, biometricAvailable, biometricEnabled, needsSetup, locked, lockEnabled, setBiometricEnabled, setAppLockEnabled, changePin } = useAppData();
  const { colorScheme, setColorScheme } = useThemeContext();
  const [showPinForm, setShowPinForm] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [lawyerName, setLawyerName] = useState(data.lawyerName ?? "");
  const [showLockConfirmation, setShowLockConfirmation] = useState(false);
  const [lockPin, setLockPin] = useState("");

  async function changeReminder(name: "reminder24hEnabled" | "reminder1hEnabled", value: boolean) {
    const next = {
      reminder24hEnabled: data.reminder24hEnabled !== false,
      reminder1hEnabled: data.reminder1hEnabled !== false,
      [name]: value,
    };
    setBusy(true);
    setNotice("");
    try {
      const prepared = await prepareAppointmentReminderUpdate(data.appointments, next);
      if (!prepared.enabled) {
        if (prepared.orphanIds.length) {
          await updateData((current) => ({ ...current, appointments: prepared.appointments }));
          setNotice("تعذرت إعادة الجدولة؛ حُفظت معرفات التذكيرات التي لم يمكن إلغاؤها لتبقى قابلة للتنظيف لاحقاً. لم يتغير إعدادك.");
        } else {
          setNotice(prepared.reason === "permission" ? "لم يتغير إعداد التذكير لأن إذن الإشعارات غير متاح. امنح الإذن من Android ثم أعد المحاولة." : "تعذرت جدولة التذكيرات الجديدة؛ بقيت الإعدادات والتنبيهات السابقة دون تغيير.");
        }
        return;
      }
      try {
        await updateData((current) => ({ ...current, ...next, appointments: prepared.appointments }));
      } catch (error) {
        await cancelScheduledReminders(prepared.newIds);
        throw error;
      }
      const failedOldIds = await cancelScheduledReminders(prepared.oldIds);
      const finalizedAppointments = prepared.appointments.map((appointment) => ({
        ...appointment,
        reminders: appointment.reminders.filter((id) => prepared.newIds.includes(id) || failedOldIds.includes(id)),
      }));
      try {
        await updateData((current) => ({ ...current, appointments: finalizedAppointments }));
        setNotice(failedOldIds.length ? "حُفظ الإعداد. تعذر إلغاء بعض التذكيرات القديمة؛ أبقينا معرفاتها محفوظة لإعادة المحاولة لاحقاً." : "حُفظ إعداد التذكير وأُعيدت جدولة المواعيد القادمة.");
      } catch {
        setNotice("حُفظ الإعداد الأولي. تعذر تنظيف معرفات التذكيرات القديمة؛ بقيت محفوظة كي يمكن إلغاؤها في المحاولة التالية.");
      }
    } catch {
      setNotice("تعذر تحديث التذكيرات. تحقق من إذن الإشعارات ثم أعد المحاولة.");
    } finally { setBusy(false); }
  }

  async function toggleBiometric(value: boolean) {
    setBusy(true);
    setNotice("");
    try {
      await setBiometricEnabled(value);
      setNotice(value ? "فُعّل فتح الخزنة ببصمة الجهاز." : "أُوقف فتح الخزنة بالبصمة؛ سيظل رمز PIN متاحاً.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر حفظ إعداد البصمة.");
    } finally { setBusy(false); }
  }

  async function saveLawyerName() {
    const name = lawyerName.trim().slice(0, 60);
    try {
      await updateData((current) => ({ ...current, lawyerName: name }));
      setLawyerName(name);
      setNotice(name ? "حُفظ اسم التحية في الخزنة المشفرة." : "حُفظت الرسالة الافتراضية للترحيب.");
    } catch { setNotice("تعذر حفظ اسم التحية."); }
  }

  async function changeAppLock(enabled: boolean) {
    setNotice("");
    if (!enabled) {
      setLockPin("");
      setShowLockConfirmation(true);
      return;
    }
    try { await setAppLockEnabled(true); }
    catch (error) { setNotice(error instanceof Error ? error.message : "تعذر تفعيل قفل التطبيق."); }
  }

  async function confirmDisableAppLock() {
    if (!/^\d{6}$/.test(lockPin)) { setNotice("أدخل رمز PIN الحالي المكوّن من ستة أرقام."); return; }
    setBusy(true); setNotice("");
    try {
      await setAppLockEnabled(false, lockPin);
      setShowLockConfirmation(false); setLockPin("");
      setNotice("أُوقف حاجز PIN والبصمة؛ ستُفتح الخزنة تلقائياً على هذا الجهاز.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إيقاف قفل التطبيق.");
    } finally { setBusy(false); }
  }

  async function cleanOrphanReminders() {
    const ids = data.orphanReminderIds ?? [];
    if (!ids.length) return;
    setBusy(true); setNotice("");
    try {
      const failed = await cancelScheduledReminders(ids);
      await updateData((current) => ({ ...current, orphanReminderIds: failed }));
      setNotice(failed.length ? `تعذر إلغاء ${failed.length} تذكيرات؛ بقيت محفوظة لإعادة المحاولة.` : "نُظفت التذكيرات القديمة.");
    } catch { setNotice("تعذر تحديث حالة التذكيرات القديمة."); }
    finally { setBusy(false); }
  }

  async function savePin() {
    if (nextPin !== confirmPin) { setNotice("رمز التأكيد لا يطابق الرمز الجديد."); return; }
    if (!/^\d{6}$/.test(nextPin)) { setNotice("يجب أن يتكون رمز PIN من ستة أرقام."); return; }
    setBusy(true);
    setNotice("");
    try {
      await changePin(currentPin, nextPin);
      setCurrentPin(""); setNextPin(""); setConfirmPin(""); setShowPinForm(false);
      setNotice("تم تغيير رمز PIN دون المساس ببيانات الخزنة.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر تغيير رمز PIN.");
    } finally { setBusy(false); }
  }

  return <Page>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 16 }}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="رجوع" style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <MaterialCommunityIcons name="arrow-right" size={21} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>إعدادات التطبيق</Text>
          <Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }}>تُحفظ خياراتك على هذا الجهاز</Text>
        </View>
      </View>

      <Card>
        <SectionTitle title="المظهر" />
        <View style={{ flexDirection: "row-reverse", gap: 9 }}>
          {([{ id: "light", label: "فاتح", icon: "white-balance-sunny" }, { id: "dark", label: "داكن", icon: "moon-waning-crescent" }] as const).map((item) => {
            const selected = colorScheme === item.id;
            return <Pressable key={item.id} onPress={() => setColorScheme(item.id)} style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderRadius: 13, backgroundColor: selected ? colors.tint : colors.background, borderWidth: 1, borderColor: selected ? colors.tint : colors.border }}>
              <MaterialCommunityIcons name={item.icon} size={18} color={selected ? "#fff" : colors.text} />
              <Text style={{ color: selected ? "#fff" : colors.text, fontWeight: "700" }}>{item.label}</Text>
            </Pressable>;
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle title="رسالة الترحيب" />
        <Field label="اسم المحامي للترحيب" value={lawyerName} onChangeText={setLawyerName} placeholder="اكتب الاسم أو اتركه فارغاً" maxLength={60} returnKeyType="done" />
        <Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, lineHeight: 18, marginBottom: 10 }}>تتغير العبارة بين الصباح والمساء بحسب ساعة الجهاز. عند ترك الاسم فارغاً تظهر «مرحباً بك، سيادة المستشار».</Text>
        <Button title="حفظ اسم الترحيب" onPress={() => void saveLawyerName()} secondary />
      </Card>

      <Card>
        <SectionTitle title="العملة المالية" />
        <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 }}>
          {currencies.map((currency) => <Pressable key={currency} onPress={() => { void updateData((current) => ({ ...current, currency })); setNotice(`العملة الحالية ${currency}`); }} style={{ minWidth: 55, alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: data.currency === currency ? colors.tint : colors.border, backgroundColor: data.currency === currency ? `${colors.tint}18` : colors.background }}>
            <Text style={{ color: data.currency === currency ? colors.tint : colors.text, fontWeight: "700" }}>{currency}</Text>
          </Pressable>)}
        </View>
      </Card>

      <Card>
        <SectionTitle title="تذكيرات المواعيد" />
        <SettingToggle title="قبل الموعد بـ24 ساعة" detail="يُعاد تطبيقه على المواعيد القادمة المحفوظة." value={data.reminder24hEnabled !== false} disabled={busy || Platform.OS === "web"} onValueChange={(value) => void changeReminder("reminder24hEnabled", value)} colors={colors} />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 5 }} />
        <SettingToggle title="قبل الموعد بساعة" detail="نص التنبيه عام ولا يعرض اسم الموكل." value={data.reminder1hEnabled !== false} disabled={busy || Platform.OS === "web"} onValueChange={(value) => void changeReminder("reminder1hEnabled", value)} colors={colors} />
      </Card>

      <Card>
        <SectionTitle title="قفل الخزنة" />
        <SettingToggle title="طلب PIN أو بصمة عند فتح التطبيق" detail="عند الإيقاف، يفتح التطبيق مباشرة. الخزنة تبقى مشفرة على الجهاز لكن يُسمح للتطبيق بفتحها تلقائياً." value={lockEnabled} disabled={busy || Platform.OS === "web" || needsSetup} onValueChange={(value) => void changeAppLock(value)} colors={colors} />
        {showLockConfirmation ? <View style={{ marginBottom: 12, padding: 12, borderRadius: 13, backgroundColor: `${colors.warning}12`, borderWidth: 1, borderColor: `${colors.warning}55` }}>
          <Text style={{ color: colors.warning, textAlign: "right", fontSize: 12, lineHeight: 19 }}>لإيقاف PIN والبصمة، أدخل رمز PIN الحالي. بعد التأكيد سيفتح التطبيق دون حاجز عند تشغيله أو العودة إليه.</Text>
          <Field label="تأكيد PIN الحالي" value={lockPin} onChangeText={(value) => setLockPin(value.replace(/\D/g, "").slice(0, 6))} placeholder="6 أرقام" keyboardType="number-pad" secureTextEntry maxLength={6} />
          <View style={{ flexDirection: "row-reverse", gap: 8 }}><View style={{ flex: 1 }}><Button title={busy ? "جارٍ التحقق…" : "تأكيد إيقاف القفل"} onPress={() => void confirmDisableAppLock()} disabled={busy} /></View><View style={{ flex: 1 }}><Button title="إلغاء" secondary onPress={() => { setShowLockConfirmation(false); setLockPin(""); }} /></View></View>
        </View> : null}
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 5 }} />
        <SettingToggle title="فتح ببصمة الجهاز" detail={biometricAvailable ? "يمكن استخدام البصمة أو وسيلة المصادقة المسجلة على الهاتف." : "لا توجد بصمة أو وسيلة مصادقة مسجلة على هذا الجهاز."} value={biometricEnabled} disabled={!biometricAvailable || busy || Platform.OS === "web"} onValueChange={(value) => void toggleBiometric(value)} colors={colors} />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 5 }} />
        <Button title={showPinForm ? "إغلاق تغيير الرمز" : "تغيير رمز PIN"} secondary onPress={() => { setShowPinForm(!showPinForm); setNotice(""); }} />
        {showPinForm ? <View style={{ marginTop: 16 }}>
          <Field label="رمز PIN الحالي" value={currentPin} onChangeText={(value) => setCurrentPin(value.replace(/\D/g, "").slice(0, 6))} placeholder="6 أرقام" keyboardType="number-pad" secureTextEntry maxLength={6} editable={Platform.OS !== "web"} />
          <Field label="رمز PIN الجديد" value={nextPin} onChangeText={(value) => setNextPin(value.replace(/\D/g, "").slice(0, 6))} placeholder="6 أرقام" keyboardType="number-pad" secureTextEntry maxLength={6} editable={Platform.OS !== "web"} />
          <Field label="تأكيد الرمز الجديد" value={confirmPin} onChangeText={(value) => setConfirmPin(value.replace(/\D/g, "").slice(0, 6))} placeholder="أعد كتابة الرمز" keyboardType="number-pad" secureTextEntry maxLength={6} editable={Platform.OS !== "web"} />
          <Button title={busy ? "جارٍ الحفظ…" : "حفظ الرمز الجديد"} onPress={() => void savePin()} disabled={busy || Platform.OS === "web"} />
          {Platform.OS === "web" ? <Text style={{ color: colors.warning, textAlign: "right", marginTop: 9, fontSize: 11 }}>تغيير الرمز متاح في تطبيق Android فقط.</Text> : null}
        </View> : null}
      </Card>

      <Card>
        <SectionTitle title="الولاية القضائية" />
        <Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, lineHeight: 18, marginBottom: 10 }}>سوريا هي الإعداد الافتراضي. العملة موحدة للخزنة؛ تغييرها يبدل رمز العرض لكل المبالغ ولا يحول الأرقام بين الليرة القديمة والجديدة.</Text>
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          {[{ id: "SY" as const, label: "سوريا" }, { id: "other" as const, label: "ولاية أخرى" }].map((option) => <Pressable key={option.id} onPress={() => void updateData((current) => ({ ...current, jurisdiction: option.id }))} style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: data.jurisdiction === option.id ? colors.tint : colors.background, borderWidth: 1, borderColor: data.jurisdiction === option.id ? colors.tint : colors.border }}><Text style={{ color: data.jurisdiction === option.id ? "#fff" : colors.text, fontWeight: "700" }}>{option.label}</Text></Pressable>)}
        </View>
      </Card>

      <Card>
        <SectionTitle title="مركز حالة الأمان" />
        <SecurityStatusRow icon="shield-lock-outline" title="تشفير الخزنة" value={Platform.OS === "web" ? "معاينة الويب غير مشفرة؛ لا تدخل بيانات حقيقية" : "AES-GCM محلي على هذا الجهاز"} color={Platform.OS === "web" ? colors.warning : colors.success} colors={colors} />
        <SecurityStatusRow icon="lock-check-outline" title="قفل التطبيق" value={Platform.OS === "web" ? "قفل الهاتف غير متاح في المعاينة" : needsSetup ? "لم يُضبط رمز PIN بعد" : !lockEnabled ? "القفل متوقف؛ التطبيق يفتح مباشرة" : locked ? "الخزنة مقفلة" : "مفتوحة بعد التحقق؛ تُقفل عند مغادرة التطبيق"} color={Platform.OS === "web" || needsSetup || !lockEnabled ? colors.warning : colors.success} colors={colors} />
        <SecurityStatusRow icon="fingerprint" title="المصادقة الحيوية" value={Platform.OS === "web" ? "غير متاحة في الويب" : !biometricAvailable ? "غير متاحة أو غير مسجلة على الجهاز" : biometricEnabled ? "مفعّلة" : "متاحة لكنها متوقفة"} color={biometricEnabled ? colors.success : colors.muted} colors={colors} />
        <SecurityStatusRow icon="backup-restore" title="آخر نسخة احتياطية" value={data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleString("ar-SY") : "لم تُجهز نسخة بعد"} color={data.lastBackupAt ? colors.tint : colors.warning} colors={colors} />
        <Text style={{ color: colors.warning, textAlign: "right", fontSize: 11, lineHeight: 18, marginTop: 10 }}>عند مشاركة أو تصدير PDF يُنشأ ملف مؤقت خارج التشفير المحلي. شاركه فقط مع جهة تثق بها؛ يحاول التطبيق حذفه بعد انتهاء المشاركة.</Text>
        <Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 17, marginTop: 7 }}>التذكيرات تستخدم رسائل عامة ولا تعرض اسم الموكل أو تفاصيل القضية على شاشة القفل.</Text>
        {Platform.OS === "android" ? <Text style={{ color: colors.warning, textAlign: "right", fontSize: 10, lineHeight: 17, marginTop: 7 }}>ودجت الشاشة الرئيسية تعرض نوع الموعد ووقته فقط خارج قفل التطبيق؛ لا تعرض أسماء الموكلين أو الملاحظات.</Text> : null}
      </Card>

      <Card>
        <SectionTitle title="النسخ وسلامة البيانات" />
        <Text style={{ color: colors.text, textAlign: "right", fontSize: 12, lineHeight: 20 }}>الخزنة المحلية مشفرة على الجهاز؛ قفل PIN اختياري من الإعدادات. آخر ملف مجهز: {data.lastBackupAt ? new Date(data.lastBackupAt).toLocaleDateString("ar-SY") : "لم تُجهز نسخة بعد"}.</Text>
        <View style={{ gap: 9, marginTop: 13 }}>
          <Button title="النسخ الاحتياطي والاستعادة" onPress={() => router.push("/(tabs)/backup" as never)} secondary icon={<MaterialCommunityIcons name="backup-restore" size={17} color={colors.text} />} />
          <Button title={`سلة المحذوفات · ${data.trash.length}`} onPress={() => router.push("/(tabs)/trash" as never)} secondary icon={<MaterialCommunityIcons name="delete-clock-outline" size={17} color={colors.text} />} />
          {data.orphanReminderIds?.length ? <Button title={`تنظيف ${data.orphanReminderIds.length} تذكيرات قديمة`} onPress={() => void cleanOrphanReminders()} secondary disabled={busy || Platform.OS === "web"} /> : null}
        </View>
        <Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 17, marginTop: 10 }}>الملف الذي تشاركه أو تصدّره يصبح خارج الخزنة المشفرة؛ لا ترسله إلا إلى جهة تثق بها. لا توجد مزامنة سحابية تلقائية.</Text>
      </Card>

      {notice ? <Card style={{ padding: 13, borderColor: colors.tint }}><Text style={{ color: colors.text, textAlign: "right", lineHeight: 22, fontSize: 12 }}>{notice}</Text></Card> : null}
      <Text style={{ color: colors.muted, textAlign: "center", fontSize: 11, lineHeight: 18 }}>سجلات المكتب والمرفقات مشفرة محلياً ولا تُرسل تلقائياً. عند استخدام المساعد الاختياري، يُرسل سؤالك والمواد التي تختارها صراحةً إلى خدمة سحابية قد تعالجها خارج سوريا. لا تضع أسماء موكلين أو أسراراً مهنية؛ لا يُعد ذلك ضماناً للامتثال القانوني.</Text>
    </ScrollView>
  </Page>;
}

function SecurityStatusRow({ icon, title, value, color, colors }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; value: string; color: string; colors: ReturnType<typeof useColors> }) {
  return <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
    <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: `${color}18` }}><MaterialCommunityIcons name={icon} size={18} color={color} /></View>
    <View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12 }}>{title}</Text><Text style={{ color, textAlign: "right", fontSize: 11, lineHeight: 17, marginTop: 2 }}>{value}</Text></View>
  </View>;
}

function SettingToggle({ title, detail, value, disabled, onValueChange, colors }: { title: string; detail: string; value: boolean; disabled: boolean; onValueChange: (value: boolean) => void; colors: ReturnType<typeof useColors> }) {
  return <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 9 }}>
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 13 }}>{title}</Text>
      <Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, lineHeight: 17, marginTop: 3 }}>{detail}</Text>
    </View>
    <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ false: colors.border, true: colors.tint }} thumbColor="#fff" />
  </View>;
}
