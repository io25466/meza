import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/app-text";
import { Button, Card, EmptyState, Page, Pill } from "@/components/ui";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { isOfficialSyriaSource } from "@/lib/legal-syria";

export default function ArticleReaderScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const articleId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { data } = useAppData();
  const [notice, setNotice] = useState("");
  const article = data.articles.find((item) => item.id === articleId);

  async function openSource() {
    if (!article?.sourceUrl) return;
    try { await Linking.openURL(article.sourceUrl); }
    catch { setNotice("تعذر فتح رابط المصدر على هذا الجهاز."); }
  }

  return <Page>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 14 }}>
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="رجوع إلى المكتبة" style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <MaterialCommunityIcons name="arrow-right" size={21} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, textAlign: "right", fontSize: 20, fontWeight: "800" }}>قراءة المادة القانونية</Text>
          <Text style={{ color: colors.muted, textAlign: "right", marginTop: 3, fontSize: 11 }}>النص المحفوظ محلياً في مكتبتك</Text>
        </View>
      </View>

      {!article ? <Card><EmptyState icon={<MaterialCommunityIcons name="book-alert-outline" size={25} color={colors.muted} />} title="المادة غير موجودة" detail="ربما نُقلت إلى سلة المحذوفات أو لم تعد ضمن المكتبة." /><Button title="العودة" secondary onPress={() => router.back()} /></Card> : <>
        <Card style={{ padding: 17 }}>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <Pill label={`مادة ${article.number}`} />
            <Pill label={article.specialty} color={colors.tint} />
            {article.favorite ? <Pill label="مفضلة" color={colors.warning} /> : null}
          </View>
          <Text style={{ color: colors.text, textAlign: "right", fontSize: 21, fontWeight: "800", lineHeight: 31, marginTop: 14 }}>{article.title}</Text>
          {article.lawNumber || article.lawYear || article.effectiveDate || article.verifiedAt ? <Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, lineHeight: 19, marginTop: 9 }}>{[article.lawNumber ? `القانون رقم ${article.lawNumber}` : "", article.lawYear ? `لسنة ${article.lawYear}` : "", article.effectiveDate ? `النفاذ: ${article.effectiveDate}` : "", article.verifiedAt ? `آخر تحقق: ${article.verifiedAt}` : ""].filter(Boolean).join(" · ")}</Text> : null}
        </Card>
        <Card style={{ padding: 18 }}>
          <Text selectable style={{ color: colors.text, textAlign: "right", fontSize: 15, lineHeight: 29 }}>{article.text}</Text>
        </Card>
        {article.sourceUrl ? <Card>
          <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12 }}>مرجع المادة</Text>
          <Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 17, marginTop: 5 }}>{isOfficialSyriaSource(article.sourceUrl) ? "الرابط على نطاق جهة سورية رسمية؛ تحقق من نفاذ النص وسريانه." : "رابط خارجي؛ لم يتم التحقق من رسميته أو سريان النص."}</Text>
          <Button title="فتح رابط المصدر" secondary onPress={() => void openSource()} icon={<MaterialCommunityIcons name="open-in-new" size={16} color={colors.warning} />} />
        </Card> : null}
        <Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 17 }}>للاطلاع والبحث فقط. راجع النص التشريعي المنشور في مصدره الرسمي قبل الاستناد إليه.</Text>
      </>}
      {notice ? <Text style={{ color: colors.warning, textAlign: "right", fontSize: 11 }}>{notice}</Text> : null}
    </ScrollView>
  </Page>;
}
