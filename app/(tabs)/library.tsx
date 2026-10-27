import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Linking, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { KeyboardAvoidingSheet } from "@/components/keyboard-avoiding-sheet";
import { AppText as Text } from "@/components/app-text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { createId, isValidISODate, normalizeArabic, type LawArticle, type LawSource, type VaultFile } from "@/lib/models";
import { deleteTemporaryCacheFile, encryptAttachment } from "@/lib/secure-vault";
import { extractDocxText } from "@/lib/document-text";
import { trpc } from "@/lib/trpc";
import { confirmDestructiveAction } from "@/lib/confirm";
import { moveRecordToTrash } from "@/lib/trash";
import { SYRIA_LEGAL_SOURCES, SYRIA_NOTICE, isOfficialSyriaSource } from "@/lib/legal-syria";
import { Button, Card, EmptyState, Field, Page, Pill, SectionTitle } from "@/components/ui";

const specialties = ["الكل", "مدني", "تجاري", "جنائي", "أحوال شخصية", "عمل", "إداري"];
const LAW_FILE_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];

function validHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try { const url = new URL(value.trim()); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
}

export default function LibraryScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, updateData } = useAppData();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("الكل");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [modal, setModal] = useState<"article" | "source" | null>(null);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [specialty, setSpecialty] = useState("مدني");
  const [body, setBody] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [lawNumber, setLawNumber] = useState("");
  const [lawYear, setLawYear] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [verifiedAt, setVerifiedAt] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [jurisdiction, setJurisdiction] = useState(data.jurisdiction === "SY" ? "سوريا" : "");
  const [sendExcerpts, setSendExcerpts] = useState(false);
  const [selectedArticles, setSelectedArticles] = useState<string[]>([]);
  const aiMutation = trpc.legalAssistant.ask.useMutation();
  const visibleArticles = useMemo(() => {
    const q = normalizeArabic(query);
    return data.articles.filter((article) => (!favoritesOnly || article.favorite) && (category === "الكل" || article.specialty === category) && (!q || normalizeArabic(`${article.title} ${article.number} ${article.specialty} ${article.text}`).includes(q)));
  }, [data.articles, query, category, favoritesOnly]);

  function resetLegalMetadata() {
    setLawNumber(""); setLawYear(""); setSourceUrl(""); setEffectiveDate(""); setVerifiedAt("");
  }

  function openArticleForm(article?: LawArticle) {
    setEditingArticleId(article?.id ?? null);
    setTitle(article?.title ?? ""); setNumber(article?.number ?? ""); setSpecialty(article?.specialty ?? "مدني"); setBody(article?.text ?? "");
    setLawNumber(article?.lawNumber ?? ""); setLawYear(article?.lawYear ?? ""); setSourceUrl(article?.sourceUrl ?? ""); setEffectiveDate(article?.effectiveDate ?? ""); setVerifiedAt(article?.verifiedAt ?? "");
    setNotice(""); setModal("article");
  }

  function openSourceForm(source?: LawSource) {
    setEditingSourceId(source?.id ?? null); setSourceTitle(source?.title ?? ""); setSpecialty(source?.specialty ?? "مدني");
    setLawNumber(source?.lawNumber ?? ""); setLawYear(source?.lawYear ?? ""); setSourceUrl(source?.sourceUrl ?? ""); setEffectiveDate(source?.effectiveDate ?? ""); setVerifiedAt(source?.verifiedAt ?? "");
    setNotice(""); setModal("source");
  }

  async function importLawFile() {
    if (!validHttpUrl(sourceUrl) || (effectiveDate && !isValidISODate(effectiveDate)) || (verifiedAt && !isValidISODate(verifiedAt))) { setNotice("تحقق من رابط المصدر وتاريخ النفاذ وآخر تاريخ تحقق."); return; }
    let pickedUri = "";
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: LAW_FILE_TYPES, copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const fileAsset = result.assets[0];
      pickedUri = fileAsset.uri;
      if (fileAsset.size && fileAsset.size > 8 * 1024 * 1024) { setNotice("الحد الأقصى لحجم الملف 8 ميغابايت."); return; }
      const info = await FileSystem.getInfoAsync(fileAsset.uri);
      if (info.exists && info.size !== undefined && info.size > 8 * 1024 * 1024) { setNotice("الحد الأقصى لحجم الملف 8 ميغابايت."); return; }
      const base64 = await FileSystem.readAsStringAsync(fileAsset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const encryptedPath = await encryptAttachment(base64, fileAsset.name);
      const extractedText = fileAsset.name.toLowerCase().endsWith(".docx") ? extractDocxText(base64) : "";
      const file: VaultFile = { id: createId("lawfile"), title: fileAsset.name, mimeType: fileAsset.mimeType ?? "application/octet-stream", encryptedFile: encryptedPath, createdAt: new Date().toISOString() };
      const source: LawSource = { id: createId("law"), title: sourceTitle.trim() || fileAsset.name, specialty, fileId: file.id, fileName: fileAsset.name, lawNumber: lawNumber.trim() || undefined, lawYear: lawYear.trim() || undefined, sourceUrl: sourceUrl.trim() || undefined, effectiveDate: effectiveDate || undefined, verifiedAt: verifiedAt || undefined, createdAt: new Date().toISOString() };
      const extractedArticle: LawArticle | null = extractedText ? { id: createId("article"), title: source.title, number: "النص الكامل", specialty, text: extractedText, favorite: false, sourceId: source.id, lawNumber: source.lawNumber, lawYear: source.lawYear, sourceUrl: source.sourceUrl, effectiveDate: source.effectiveDate, verifiedAt: source.verifiedAt, createdAt: new Date().toISOString() } : null;
      await updateData((current) => ({ ...current, files: [file, ...current.files], lawSources: [source, ...current.lawSources], articles: extractedArticle ? [extractedArticle, ...current.articles] : current.articles }));
      setNotice(extractedArticle ? "حُفظ الملف مشفراً واستُخرج نص DOCX محلياً لفهرسته والبحث فيه." : "حُفظ ملف القانون مشفراً. أضف نصوص المواد يدوياً لتصبح قابلة للبحث؛ لا يجري OCR على ملفات PDF المصورة.");
      setModal(null); setSourceTitle(""); resetLegalMetadata();
    } catch { setNotice("تعذر استيراد القانون."); }
    finally { if (pickedUri) await deleteTemporaryCacheFile(pickedUri); }
  }

  async function saveArticle() {
    if (!title.trim() || !number.trim() || !body.trim()) { setNotice("أكمل عنوان المادة ورقمها ونصها."); return; }
    if (!validHttpUrl(sourceUrl) || (effectiveDate && !isValidISODate(effectiveDate)) || (verifiedAt && !isValidISODate(verifiedAt))) { setNotice("تحقق من رابط المصدر وتاريخ النفاذ وآخر تاريخ تحقق."); return; }
    const existing = data.articles.find((item) => item.id === editingArticleId);
    const article: LawArticle = { id: existing?.id ?? createId("article"), title: title.trim(), number: number.trim(), specialty, text: body.trim(), favorite: existing?.favorite ?? false, sourceId: existing?.sourceId, lawNumber: lawNumber.trim() || undefined, lawYear: lawYear.trim() || undefined, sourceUrl: sourceUrl.trim() || undefined, effectiveDate: effectiveDate || undefined, verifiedAt: verifiedAt || undefined, createdAt: existing?.createdAt ?? new Date().toISOString() };
    await updateData((current) => ({ ...current, articles: existing ? current.articles.map((item) => item.id === article.id ? article : item) : [article, ...current.articles] }));
    setModal(null); setEditingArticleId(null); setTitle(""); setNumber(""); setBody(""); resetLegalMetadata(); setNotice(existing ? "حُفظت تعديلات المادة." : "أُضيفت المادة إلى مكتبتك المحلية.");
  }

  async function saveSourceMetadata() {
    const existing = data.lawSources.find((item) => item.id === editingSourceId);
    if (!existing) return;
    if (!sourceTitle.trim() || !validHttpUrl(sourceUrl) || (effectiveDate && !isValidISODate(effectiveDate)) || (verifiedAt && !isValidISODate(verifiedAt))) { setNotice("أكمل عنوان المصدر وتحقق من الرابط والتواريخ."); return; }
    await updateData((current) => ({
      ...current,
      lawSources: current.lawSources.map((item) => item.id === existing.id ? { ...item, title: sourceTitle.trim(), specialty, lawNumber: lawNumber.trim() || undefined, lawYear: lawYear.trim() || undefined, sourceUrl: sourceUrl.trim() || undefined, effectiveDate: effectiveDate || undefined, verifiedAt: verifiedAt || undefined } : item),
      articles: current.articles.map((article) => article.sourceId === existing.id ? { ...article, specialty, lawNumber: lawNumber.trim() || undefined, lawYear: lawYear.trim() || undefined, sourceUrl: sourceUrl.trim() || undefined, effectiveDate: effectiveDate || undefined, verifiedAt: verifiedAt || undefined } : article),
    }));
    setModal(null); setEditingSourceId(null); resetLegalMetadata(); setNotice("حُفظت بيانات المصدر.");
  }

  async function archiveArticle(article: LawArticle) {
    const yes = await confirmDestructiveAction("نقل المادة إلى سلة المحذوفات؟", `ستُنقل «${article.title} — المادة ${article.number}» إلى السلة ويمكن استعادتها.`, "نقل إلى السلة");
    if (yes) await updateData((current) => moveRecordToTrash(current, "article", article.id).data);
  }

  async function archiveSource(source: LawSource) {
    const yes = await confirmDestructiveAction("نقل المصدر إلى سلة المحذوفات؟", `سينتقل «${source.title}» وملفه والمواد المستخرجة المرتبطة به إلى السلة.`, "نقل إلى السلة");
    if (yes) await updateData((current) => moveRecordToTrash(current, "lawSource", source.id).data);
  }

  async function openSource(url?: string) {
    if (!url || !validHttpUrl(url)) { setNotice("لا يوجد رابط مصدر صالح للفتح."); return; }
    try { await Linking.openURL(url); } catch { setNotice("تعذر فتح رابط المصدر على هذا الجهاز."); }
  }

  function renderLegalMetadataFields() {
    return <>
      <View style={{ flexDirection: "row-reverse", gap: 9 }}><View style={{ flex: 1 }}><Field label="رقم القانون" value={lawNumber} onChangeText={setLawNumber} placeholder="اختياري" /></View><View style={{ flex: 1 }}><Field label="سنة القانون" value={lawYear} onChangeText={setLawYear} placeholder="مثال: 2024" /></View></View>
      <Field label="رابط المصدر" value={sourceUrl} onChangeText={setSourceUrl} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
      {sourceUrl ? <View style={{ alignItems: "flex-end", marginBottom: 8 }}><Pill label={isOfficialSyriaSource(sourceUrl) ? "نطاق جهة سورية رسمية" : "رابط خارجي / غير متحقق"} color={isOfficialSyriaSource(sourceUrl) ? colors.success : colors.warning} /></View> : null}
      <View style={{ flexDirection: "row-reverse", gap: 9 }}><View style={{ flex: 1 }}><Field label="تاريخ النفاذ" value={effectiveDate} onChangeText={setEffectiveDate} placeholder="YYYY-MM-DD" /></View><View style={{ flex: 1 }}><Field label="آخر تحقق" value={verifiedAt} onChangeText={setVerifiedAt} placeholder="YYYY-MM-DD" /></View></View>
      <Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 16, marginBottom: 10 }}>{SYRIA_NOTICE} وجود رابط رسمي لا يؤكد وحده نفاذ النص أو سريانه.</Text>
    </>;
  }

  async function toggleFavorite(article: LawArticle) {
    await updateData((current) => ({ ...current, articles: current.articles.map((item) => item.id === article.id ? { ...item, favorite: !item.favorite } : item) }));
  }

  async function askAssistant() {
    if (question.trim().length < 5) { setNotice("اكتب سؤالاً واضحاً للمساعد."); return; }
    if (sendExcerpts && selectedArticles.length === 0) { setNotice("حدد مادة واحدة على الأقل لإرسالها للمساعد."); return; }
    setNotice("");
    try {
      const excerpts = sendExcerpts ? data.articles.filter((item) => selectedArticles.includes(item.id)).slice(0, 3).map((item) => `${item.title} المادة ${item.number} (${item.specialty}): ${item.text}`) : [];
      const result = await aiMutation.mutateAsync({ question: `الولاية القضائية: ${jurisdiction.trim() || "غير محددة"}. ${question.trim()}`, excerpts });
      setNotice(result.answer);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر الوصول إلى المساعد حالياً. لم تُحفظ المحادثة.");
    }
  }

  return <Page><ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30, gap: 16 }} keyboardShouldPersistTaps="handled">
    <View><Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>مكتبة القوانين</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 5 }}>موادك ومصادرك القانونية في مكان واحد</Text></View>
    <View style={{ flexDirection: "row-reverse", gap: 8 }}><Button title="إضافة مادة" onPress={() => openArticleForm()} secondary /><Button title="استيراد قانون" onPress={() => openSourceForm()} icon={<MaterialCommunityIcons name="file-upload-outline" size={17} color="#fff" />} /></View>
    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 13, height: 47, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}><MaterialCommunityIcons name="magnify" size={20} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث داخل نص المادة أو رقمها" placeholderTextColor={colors.muted} textAlign="right" style={{ flex: 1, color: colors.text }} /><Pressable onPress={() => setFavoritesOnly(!favoritesOnly)}><MaterialCommunityIcons name={favoritesOnly ? "star" : "star-outline"} size={21} color={favoritesOnly ? colors.warning : colors.muted} /></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row-reverse", gap: 7 }}>{specialties.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: category === item ? colors.tint : colors.surface, borderColor: colors.border, borderWidth: 1 }}><Text style={{ color: category === item ? "#fff" : colors.text, fontSize: 11, fontWeight: "700" }}>{item}</Text></Pressable>)}</ScrollView>
    {data.jurisdiction === "SY" ? <Card><SectionTitle title="مصادر سورية رسمية للرجوع" />{SYRIA_LEGAL_SOURCES.map((source) => <Pressable key={source.url} onPress={() => void openSource(source.url)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}><MaterialCommunityIcons name="open-in-new" size={17} color={colors.tint} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12 }}>{source.title}</Text><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 3 }}>{source.role}</Text></View></Pressable>)}<Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 16, marginTop: 8 }}>{SYRIA_NOTICE}</Text></Card> : null}
    {notice ? <Card style={{ backgroundColor: aiMutation.isSuccess ? `${colors.tint}0A` : colors.surface }}><Text style={{ color: colors.text, textAlign: "right", lineHeight: 23, fontSize: 13 }}>{notice}</Text>{aiMutation.isSuccess ? <Text style={{ color: colors.warning, textAlign: "right", marginTop: 10, fontSize: 11 }}>إجابة آلية للبحث فقط؛ راجع النص الرسمي والولاية القضائية قبل الاعتماد.</Text> : null}</Card> : null}
    <View><SectionTitle title={favoritesOnly ? "المواد المفضلة" : `المواد القانونية (${visibleArticles.length})`} />{visibleArticles.length ? <View style={{ gap: 9 }}>{visibleArticles.map((article) => <Card key={article.id}><View style={{ flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 }}><View style={{ flex: 1 }}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "800", fontSize: 14, flexShrink: 1 }}>{article.title}</Text><Pill label={`مادة ${article.number}`} /></View><Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, marginTop: 5 }}>{article.specialty}</Text></View><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7 }}><Pressable onPress={() => void toggleFavorite(article)} accessibilityLabel="تمييز المادة مفضلة"><MaterialCommunityIcons name={article.favorite ? "star" : "star-outline"} size={20} color={article.favorite ? colors.warning : colors.muted} /></Pressable><Pressable onPress={() => openArticleForm(article)} accessibilityLabel="تعديل المادة"><MaterialCommunityIcons name="pencil-outline" size={18} color={colors.tint} /></Pressable><Pressable onPress={() => void archiveArticle(article).catch(() => setNotice("تعذر نقل المادة إلى السلة."))} accessibilityLabel="نقل المادة للسلة"><MaterialCommunityIcons name="delete-outline" size={18} color={colors.error} /></Pressable></View></View><Pressable onPress={() => router.push(`/(tabs)/article/${encodeURIComponent(article.id)}` as never)} accessibilityRole="button" accessibilityLabel={`قراءة النص الكامل للمادة ${article.number}`} style={{ marginTop: 11, padding: 11, borderRadius: 12, backgroundColor: colors.background }}><Text numberOfLines={3} ellipsizeMode="tail" style={{ color: colors.text, textAlign: "right", lineHeight: 22, fontSize: 13 }}>{article.text}</Text><Text style={{ color: colors.tint, textAlign: "right", fontSize: 11, fontWeight: "700", marginTop: 7 }}>اقرأ المادة كاملة ←</Text></Pressable>{article.lawNumber || article.lawYear || article.effectiveDate || article.verifiedAt ? <Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 17, marginTop: 7 }}>{[article.lawNumber ? `قانون ${article.lawNumber}` : "", article.lawYear ? `سنة ${article.lawYear}` : "", article.effectiveDate ? `نفاذ ${article.effectiveDate}` : "", article.verifiedAt ? `تحقق ${article.verifiedAt}` : ""].filter(Boolean).join(" · ")}</Text> : null}{article.sourceUrl ? <Pressable onPress={() => void openSource(article.sourceUrl)} style={{ alignSelf: "flex-start", flexDirection: "row-reverse", gap: 4, alignItems: "center", marginTop: 5 }}><MaterialCommunityIcons name="open-in-new" size={14} color={colors.tint} /><Text style={{ color: isOfficialSyriaSource(article.sourceUrl) ? colors.success : colors.warning, fontSize: 10 }}>{isOfficialSyriaSource(article.sourceUrl) ? "فتح رابط مصدر من نطاق رسمي" : "فتح رابط مصدر خارجي"}</Text></Pressable> : null}<Pressable onPress={() => setSelectedArticles((current) => current.includes(article.id) ? current.filter((id) => id !== article.id) : [...current.filter((id) => data.articles.find((item) => item.id === id)?.id), article.id].slice(-3))} style={{ alignSelf: "flex-start", flexDirection: "row-reverse", alignItems: "center", gap: 5, marginTop: 11 }}><MaterialCommunityIcons name={selectedArticles.includes(article.id) ? "checkbox-marked-outline" : "checkbox-blank-outline"} size={18} color={colors.tint} /><Text style={{ color: colors.tint, fontSize: 11 }}>اختيار للمساعد</Text></Pressable></Card>)}</View> : <Card><EmptyState icon={<MaterialCommunityIcons name="book-open-page-variant-outline" size={24} color={colors.muted} />} title="مكتبتك بانتظار أول مادة" detail="أضف النصوص القانونية للبحث بها، أو احفظ ملفات PDF وWord مشفرة في مكتبك." /></Card>}</View>
    {data.lawSources.length ? <View><SectionTitle title="مصادر محفوظة" />{data.lawSources.map((source) => <Card key={source.id} style={{ marginBottom: 8 }}><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 9 }}><MaterialCommunityIcons name="file-lock-outline" size={22} color={colors.tint} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700" }}>{source.title}</Text><Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, marginTop: 3 }}>{source.specialty} · {source.fileName}</Text></View><Pressable onPress={() => openSourceForm(source)} accessibilityLabel="تعديل بيانات المصدر"><MaterialCommunityIcons name="pencil-outline" size={18} color={colors.tint} /></Pressable><Pressable onPress={() => void archiveSource(source).catch(() => setNotice("تعذر نقل المصدر إلى السلة."))} accessibilityLabel="نقل المصدر للسلة"><MaterialCommunityIcons name="delete-outline" size={18} color={colors.error} /></Pressable></View><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 8 }}>{[source.lawNumber ? `قانون ${source.lawNumber}` : "", source.lawYear ? `سنة ${source.lawYear}` : "", source.effectiveDate ? `نفاذ ${source.effectiveDate}` : "", source.verifiedAt ? `تحقق ${source.verifiedAt}` : ""].filter(Boolean).join(" · ") || "لم تُدخل بيانات رقم/سنة/نفاذ/تحقق بعد."}</Text>{source.sourceUrl ? <Pressable onPress={() => void openSource(source.sourceUrl)} style={{ alignSelf: "flex-start", flexDirection: "row-reverse", gap: 4, alignItems: "center", marginTop: 4 }}><MaterialCommunityIcons name="open-in-new" size={14} color={colors.tint} /><Text style={{ color: isOfficialSyriaSource(source.sourceUrl) ? colors.success : colors.warning, fontSize: 10 }}>{isOfficialSyriaSource(source.sourceUrl) ? "فتح رابط من نطاق رسمي" : "فتح رابط خارجي"}</Text></Pressable> : null}</Card>)}</View> : null}
    <Card><View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 9, marginBottom: 11 }}><MaterialCommunityIcons name="robot-outline" size={22} color={colors.tint} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>مساعد ميزان الذكي</Text><Pill label="اختياري" /></View><Text style={{ color: colors.muted, textAlign: "right", fontSize: 12, lineHeight: 20, marginBottom: 13 }}>عند الضغط على «اسأل المساعد» يُرسل السؤال إلى خدمة ذكاء اصطناعي سحابية وقد يُعالج خارج سوريا. لا تُرسل مواد المكتبة إلا بعد اختيارها والموافقة صراحةً؛ لا تضع أسماء موكلين أو أسراراً مهنية.</Text><Field label="الدولة أو الولاية القضائية (اختياري)" value={jurisdiction} onChangeText={setJurisdiction} placeholder="مثال: المملكة العربية السعودية" /><Field label="سؤالك القانوني" value={question} onChangeText={setQuestion} placeholder="اكتب سؤال بحث عام" multiline /><Pressable onPress={() => setSendExcerpts(!sendExcerpts)} style={{ flexDirection: "row-reverse", alignItems: "center", gap: 7, marginBottom: 12 }}><MaterialCommunityIcons name={sendExcerpts ? "checkbox-marked-outline" : "checkbox-blank-outline"} size={20} color={colors.tint} /><Text style={{ color: colors.text, textAlign: "right", fontSize: 12 }}>أوافق على إرسال المواد المحددة للمساعد</Text></Pressable><Button title={aiMutation.isPending ? "جارٍ إعداد الإجابة…" : "اسأل المساعد"} onPress={() => void askAssistant()} disabled={aiMutation.isPending} icon={<MaterialCommunityIcons name="send" size={16} color="#fff" />} /></Card>
    <Text style={{ color: colors.muted, textAlign: "center", fontSize: 10 }}>لا تتضمن المكتبة قوانين رسمية مسبقة. راجع التشريعات المنشورة في مصدرها الرسمي.</Text>
  </ScrollView>
  <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}><KeyboardAvoidingSheet><View style={{ maxHeight: "91%", backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}><ScrollView keyboardShouldPersistTaps="handled"><View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 16 }}><Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{modal === "article" ? editingArticleId ? "تعديل مادة قانونية" : "إضافة مادة قانونية" : editingSourceId ? "تعديل بيانات مصدر قانون" : "استيراد مصدر قانون"}</Text><Pressable onPress={() => setModal(null)}><MaterialCommunityIcons name="close" size={23} color={colors.muted} /></Pressable></View>{modal === "article" ? <><Field label="اسم القانون" value={title} onChangeText={setTitle} placeholder="اسم النظام أو القانون" /><Field label="رقم المادة" value={number} onChangeText={setNumber} placeholder="رقم المادة" /><Text style={{ color: colors.text, textAlign: "right", marginBottom: 8, fontWeight: "700" }}>التخصص</Text><View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>{specialties.slice(1).map((item) => <Pressable key={item} onPress={() => setSpecialty(item)} style={{ padding: 9, borderRadius: 12, backgroundColor: specialty === item ? colors.tint : colors.background }}><Text style={{ color: specialty === item ? "#fff" : colors.text, fontSize: 12 }}>{item}</Text></Pressable>)}</View><Field label="نص المادة" value={body} onChangeText={setBody} placeholder="أدخل نص المادة كما ورد في المصدر الرسمي" multiline />{renderLegalMetadataFields()}<Button title={editingArticleId ? "حفظ تعديلات المادة" : "حفظ المادة"} onPress={() => void saveArticle()} /></> : <><Field label="عنوان القانون" value={sourceTitle} onChangeText={setSourceTitle} placeholder="اسم القانون أو النظام" /><Text style={{ color: colors.text, textAlign: "right", marginBottom: 8, fontWeight: "700" }}>التخصص</Text><View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>{specialties.slice(1).map((item) => <Pressable key={item} onPress={() => setSpecialty(item)} style={{ padding: 9, borderRadius: 12, backgroundColor: specialty === item ? colors.tint : colors.background }}><Text style={{ color: specialty === item ? "#fff" : colors.text, fontSize: 12 }}>{item}</Text></Pressable>)}</View>{renderLegalMetadataFields()}<Text style={{ color: colors.muted, textAlign: "right", marginBottom: 14, fontSize: 12, lineHeight: 19 }}>يُحفظ PDF أو Word بتشفير محلي. لا يستخرج التطبيق النص آلياً من PDF المصور حالياً؛ أضف نص المواد بنفسك لتفعيل البحث.</Text>{editingSourceId ? <Button title="حفظ بيانات المصدر" onPress={() => void saveSourceMetadata()} /> : <Button title="اختيار ملف وحفظه مشفراً" onPress={() => void importLawFile()} />}</>}</ScrollView></View></KeyboardAvoidingSheet></Modal>
  </Page>;
}
