import React from "react";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, type TextInputProps, View, type ViewStyle } from "react-native";
import { AppText as Text, useArabicFontFamily } from "@/components/app-text";
import { useColors } from "@/hooks/use-colors";

export function Page({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const colors = useColors();
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}><View style={[{ flex: 1, backgroundColor: colors.background }, style]}>{children}</View></KeyboardAvoidingView>;
}

export function Card({ children, style }: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const colors = useColors();
  const dark = colors.background === "#111820";
  return <View style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, shadowColor: "#142B45", shadowOffset: { width: 0, height: 2 }, shadowOpacity: dark ? 0.12 : 0.055, shadowRadius: 7, elevation: dark ? 0 : 1 }, style]}>{children}</View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><Text style={{ color: colors.text, fontSize: 17, fontWeight: "700", textAlign: "right" }}>{title}</Text>{action ? <Pressable onPress={onAction}><Text style={{ color: colors.tint, fontSize: 13, fontWeight: "600" }}>{action}</Text></Pressable> : null}</View>;
}

export function Button({ title, onPress, secondary = false, disabled = false, icon }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: React.ReactNode }) {
  const colors = useColors();
  const dark = colors.background === "#111820";
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderRadius: 14, paddingHorizontal: 16, backgroundColor: secondary ? (dark ? colors.surface : "#FBF8F1") : colors.tint, borderWidth: secondary ? 1 : 0, borderColor: secondary ? `${colors.warning}66` : colors.border, opacity: disabled ? 0.45 : pressed ? 0.78 : 1, transform: [{ scale: pressed && !disabled ? 0.985 : 1 }] })}><Text style={{ color: secondary ? colors.warning : (dark ? "#101820" : "#FFFFFF"), fontWeight: "700", fontSize: 14 }}>{title}</Text>{icon}</Pressable>;
}

export function Field({ label, value, onChangeText, placeholder, keyboardType, multiline = false, ...props }: TextInputProps & { label: string; value: string; onChangeText: (text: string) => void; placeholder?: string; multiline?: boolean }) {
  const colors = useColors();
  const fontFamily = useArabicFontFamily();
  return <View style={{ gap: 7, marginBottom: 12 }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 13, fontWeight: "600" }}>{label}</Text><TextInput {...props} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} multiline={multiline} textAlign="right" placeholderTextColor={colors.muted} style={{ minHeight: multiline ? 110 : 48, paddingHorizontal: 13, paddingVertical: 10, color: colors.text, backgroundColor: colors.background, borderRadius: 12, borderWidth: 1, borderColor: colors.border, fontSize: 14, textAlignVertical: multiline ? "top" : "center", ...(fontFamily ? { fontFamily } : {}) }} /></View>;
}

export function Pill({ label, color }: { label: string; color?: string }) {
  const colors = useColors();
  return <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: `${color ?? colors.tint}20` }}><Text style={{ color: color ?? colors.tint, fontSize: 11, fontWeight: "700" }}>{label}</Text></View>;
}

export function EmptyState({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  const colors = useColors();
  return <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 22, paddingVertical: 26 }}><View style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>{icon}</View><Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 21 }}>{detail}</Text></View>;
}
