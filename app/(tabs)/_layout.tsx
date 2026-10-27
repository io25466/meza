import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { AppText as Text, useArabicFontFamily } from "@/components/app-text";
import { Tabs, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useThemeContext } from "@/lib/theme-provider";
import { useAppData } from "@/lib/app-data";
import { searchAll } from "@/lib/search";

const tabs = [
  { name: "index", title: "الرئيسية", icon: "view-dashboard-outline" },
  { name: "clients", title: "القضايا", icon: "briefcase-outline" },
  { name: "finance", title: "المالية", icon: "wallet-outline" },
  { name: "vault", title: "الخزنة", icon: "folder-lock-outline" },
  { name: "library", title: "المكتبة", icon: "bookshelf" },
] as const;

function GlobalHeader() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, lock } = useAppData();
  const { colorScheme, setColorScheme } = useThemeContext();
  const fontFamily = useArabicFontFamily();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchAll(data, query), [data, query]);

  return <>
    <View style={{ backgroundColor: colors.surface, paddingTop: Math.max(insets.top, 8), paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 }}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 9 }}><View style={{ width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.tint }}><MaterialCommunityIcons name="scale-balance" size={19} color="#fff" /></View><View><Text style={{ color: colors.text, textAlign: "right", fontSize: 17, fontWeight: "800" }}>ميزان</Text><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10 }}>مكتبك القانوني الخاص</Text></View></View>
        <View style={{ flexDirection: "row-reverse", gap: 5 }}>
          <Pressable accessibilityLabel="إعدادات التطبيق" onPress={() => router.push("/(tabs)/settings" as never)} style={{ padding: 9 }}><MaterialCommunityIcons name="cog-outline" size={19} color={colors.text} /></Pressable>
          <Pressable accessibilityLabel="تغيير المظهر" onPress={() => setColorScheme(colorScheme === "dark" ? "light" : "dark")} style={{ padding: 9 }}><MaterialCommunityIcons name={colorScheme === "dark" ? "white-balance-sunny" : "moon-waning-crescent"} size={19} color={colors.text} /></Pressable>
          <Pressable accessibilityLabel="قفل التطبيق" onPress={lock} style={{ padding: 9 }}><MaterialCommunityIcons name="lock-outline" size={19} color={colors.text} /></Pressable>
        </View>
      </View>
      <Pressable onPress={() => setVisible(true)} accessibilityLabel="البحث الشامل" style={{ flexDirection: "row-reverse", alignItems: "center", gap: 10, height: 46, paddingHorizontal: 13, borderRadius: 14, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}><MaterialCommunityIcons name="magnify" size={20} color={colors.muted} /><Text style={{ color: colors.muted, flex: 1, textAlign: "right", fontSize: 13 }}>ابحث عن موكل، وكالة، موعد أو مادة قانونية</Text><MaterialCommunityIcons name="tune-variant" size={18} color={colors.muted} /></Pressable>
      {Platform.OS === "web" ? <Text style={{ color: colors.warning, textAlign: "right", fontSize: 10 }}>معاينة الويب غير مشفرة؛ لا تدخل بيانات موكلين حقيقية.</Text> : null}
    </View>
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0} style={{ flex: 1, backgroundColor: colors.background, paddingTop: Math.max(insets.top, 16) }}>
        <View style={{ flexDirection: "row-reverse", gap: 10, alignItems: "center", paddingHorizontal: 18, paddingVertical: 12 }}><Pressable onPress={() => setVisible(false)}><MaterialCommunityIcons name="arrow-right" size={24} color={colors.text} /></Pressable><View style={{ flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12 }}><MaterialCommunityIcons name="magnify" size={20} color={colors.muted} /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="ابحث في ملفات المكتب" placeholderTextColor={colors.muted} textAlign="right" style={{ flex: 1, height: 48, color: colors.text, ...(fontFamily ? { fontFamily } : {}) }} /><Pressable onPress={() => setQuery("")}><MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} /></Pressable></View></View>
        <Text style={{ textAlign: "right", color: colors.muted, marginHorizontal: 20, marginVertical: 8, fontSize: 12 }}>{query ? `${hits.length} نتيجة` : "ابحث في الموكلين والقضايا والوكالات والمواعيد والمواد"}</Text>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
          {hits.map((hit, index) => <Pressable key={`${hit.type}-${index}`} onPress={() => { setVisible(false); router.push(`/(tabs)/${hit.tab}` as never); }} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}><View style={{ width: 38, height: 38, backgroundColor: colors.surface, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name="file-search-outline" size={19} color={colors.tint} /></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.text, textAlign: "right", fontWeight: "700" }}>{hit.title}</Text><Text numberOfLines={1} style={{ color: colors.muted, textAlign: "right", fontSize: 12, marginTop: 4 }}>{hit.type} · {hit.subtitle}</Text></View><MaterialCommunityIcons name="chevron-left" size={20} color={colors.muted} /></Pressable>)}
          {query && hits.length === 0 ? <Text style={{ color: colors.muted, textAlign: "center", padding: 32 }}>لا توجد نتائج مطابقة</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <GlobalHeader />
    <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, tabBarActiveTintColor: colors.tint, tabBarInactiveTintColor: colors.muted, tabBarLabelStyle: { fontSize: 10, fontWeight: "600" }, tabBarStyle: { height: 59 + bottomPadding, paddingTop: 6, paddingBottom: bottomPadding, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 } }}>
      {tabs.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title, tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={tab.icon as never} color={color} size={size} /> }} />)}
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="tasks" options={{ href: null }} />
      <Tabs.Screen name="templates" options={{ href: null }} />
      <Tabs.Screen name="backup" options={{ href: null }} />
      <Tabs.Screen name="trash" options={{ href: null }} />
      <Tabs.Screen name="timeline" options={{ href: null }} />
    </Tabs>
  </View>;
}
