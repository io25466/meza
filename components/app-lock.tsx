import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { AppText as Text, useArabicFontFamily } from "@/components/app-text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";

export function AppLockScreen() {
  const colors = useColors();
  const fontFamily = useArabicFontFamily();
  const { needsSetup, setPin, unlock, unlockBiometric, biometricAvailable, biometricEnabled } = useAppData();
  const [pin, setPinValue] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    if (!/^\d{6}$/.test(pin)) { setError("أدخل رمزاً من 6 أرقام"); return; }
    setBusy(true);
    try {
      if (needsSetup) {
        if (confirmation !== pin) { setError("الرمزان غير متطابقين"); setConfirmation(""); return; }
        await setPin(pin);
      } else if (!(await unlock(pin))) setError("الرمز غير صحيح");
      setPinValue("");
    } catch {
      setError("تعذر فتح الخزنة. حاول مرة أخرى.");
    } finally { setBusy(false); }
  }

  async function biometric() {
    setBusy(true);
    try { if (!(await unlockBiometric())) setError("لم يتم التحقق بالبصمة"); }
    catch { setError("تعذر استخدام بصمة الجهاز"); }
    finally { setBusy(false); }
  }

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", paddingHorizontal: 28 }}>
    <View style={{ alignItems: "center", marginBottom: 28 }}>
      <View style={{ height: 74, width: 74, borderRadius: 24, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center", marginBottom: 18 }}><MaterialCommunityIcons name="scale-balance" size={36} color="#fff" /></View>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800" }}>ميزان</Text>
      <Text style={{ color: colors.muted, fontSize: 14, marginTop: 8 }}>{needsSetup ? "أنشئ رمزاً سرياً لخزنتك المحلية" : "ملفاتك محفوظة داخل خزنة مشفرة"}</Text>
    </View>
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 20, padding: 20 }}>
      <Text style={{ color: colors.text, textAlign: "right", marginBottom: 9, fontWeight: "700" }}>{needsSetup ? "الرمز السري" : "رمز الدخول"}</Text>
      <TextInput value={pin} onChangeText={(value) => setPinValue(value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" keyboardType="number-pad" secureTextEntry maxLength={6} textAlign="center" placeholderTextColor={colors.muted} style={{ color: colors.text, letterSpacing: 12, fontSize: 24, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, ...(fontFamily ? { fontFamily } : {}) }} />
      {needsSetup ? <><Text style={{ color: colors.text, textAlign: "right", marginTop: 14, marginBottom: 9, fontWeight: "700" }}>تأكيد الرمز</Text><TextInput value={confirmation} onChangeText={(value) => setConfirmation(value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" keyboardType="number-pad" secureTextEntry maxLength={6} textAlign="center" placeholderTextColor={colors.muted} style={{ color: colors.text, letterSpacing: 12, fontSize: 24, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, ...(fontFamily ? { fontFamily } : {}) }} /></> : null}
      {error ? <Text style={{ color: colors.error, textAlign: "right", marginTop: 12 }}>{error}</Text> : null}
      <Pressable onPress={() => void submit()} disabled={busy} style={{ backgroundColor: colors.tint, borderRadius: 13, marginTop: 16, padding: 15, alignItems: "center" }}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>{needsSetup ? "إنشاء الخزنة" : "فتح التطبيق"}</Text>}</Pressable>
      {!needsSetup && biometricAvailable && biometricEnabled ? <Pressable onPress={() => void biometric()} style={{ alignItems: "center", padding: 16, flexDirection: "row-reverse", justifyContent: "center", gap: 8 }}><MaterialCommunityIcons name="fingerprint" size={22} color={colors.tint} /><Text style={{ color: colors.tint, fontWeight: "700" }}>فتح ببصمة الجهاز</Text></Pressable> : null}
    </View>
    <Text style={{ color: colors.muted, textAlign: "center", fontSize: 11, marginTop: 20, lineHeight: 18 }}>البيانات مشفرة على هذا الجهاز. احتفظ برمزك؛ لا توجد نسخة سحابية لاستعادته.</Text>
  </KeyboardAvoidingView>;
}
