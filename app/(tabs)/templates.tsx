import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/app-text";
import { KeyboardAvoidingSheet } from "@/components/keyboard-avoiding-sheet";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Page,
  SectionTitle,
} from "@/components/ui";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { createId, type DocumentTemplate } from "@/lib/models";
import { deleteTemporaryCacheFile } from "@/lib/secure-vault";
import { confirmDestructiveAction } from "@/lib/confirm";
import { moveRecordToTrash } from "@/lib/trash";

type Sheet = "editor" | "draft" | "versions" | null;

const TOKENS = [
  "{{client_name}}",
  "{{client_phone}}",
  "{{case_title}}",
  "{{case_number}}",
  "{{case_type}}",
  "{{court}}",
  "{{case_status}}",
  "{{current_date}}",
];

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function fillTemplate(
  template: string,
  client: { name: string; phone: string },
  legalCase: {
    title: string;
    type: string;
    status: string;
    caseNumber?: string;
    court?: string;
  },
): string {
  const values: Record<string, string> = {
    "{{client_name}}": client.name,
    "{{client_phone}}": client.phone,
    "{{case_title}}": legalCase.title,
    "{{case_number}}": legalCase.caseNumber ?? "",
    "{{case_type}}": legalCase.type,
    "{{court}}": legalCase.court ?? "",
    "{{case_status}}": legalCase.status,
    "{{current_date}}": new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "long",
    }).format(new Date()),
  };
  return template.replace(
    /\{\{(?:client_name|client_phone|case_title|case_number|case_type|court|case_status|current_date)\}\}/g,
    (token) => values[token] ?? token,
  );
}

function documentHtml(title: string, body: string): string {
  // Escape the completed document (including substituted values) before it enters HTML.
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\r?\n/g, "<br />");
  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 22mm 18mm; }
    body { direction: rtl; font-family: Arial, sans-serif; color: #18212b; font-size: 14px; line-height: 1.9; }
    h1 { font-size: 20px; text-align: center; margin: 0 0 24px; }
    .document { white-space: normal; }
  </style>
</head>
<body><h1>${safeTitle}</h1><div class="document">${safeBody || "&nbsp;"}</div></body>
</html>`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-SA");
}

export default function TemplatesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { data, updateData } = useAppData();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyTemplateId, setHistoryTemplateId] = useState<string | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draftTemplateId, setDraftTemplateId] = useState("");
  const [draftClientId, setDraftClientId] = useState("");
  const [draftCaseId, setDraftCaseId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const historyTemplate = data.templates.find(
    (item) => item.id === historyTemplateId,
  );
  const draftTemplate = data.templates.find(
    (item) => item.id === draftTemplateId,
  );
  const draftClient = data.clients.find((item) => item.id === draftClientId);
  const availableDraftCases = useMemo(
    () => data.cases.filter((item) => item.clientId === draftClientId),
    [data.cases, draftClientId],
  );
  const draftCase = availableDraftCases.find((item) => item.id === draftCaseId);
  const draftedBody =
    draftTemplate && draftClient && draftCase
      ? fillTemplate(draftTemplate.body, draftClient, draftCase)
      : "";

  function closeSheet() {
    setSheet(null);
    setEditingId(null);
    setHistoryTemplateId(null);
    setTitle("");
    setBody("");
    setNotice("");
  }

  function openNewTemplate() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setNotice("");
    setSheet("editor");
  }

  function openEditTemplate(template: DocumentTemplate) {
    setEditingId(template.id);
    setTitle(template.title);
    setBody(template.body);
    setNotice("");
    setSheet("editor");
  }

  async function saveTemplate() {
    if (!title.trim()) {
      setNotice("أدخل اسم القالب أولاً.");
      return;
    }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      if (editingId) {
        await updateData((current) => ({
          ...current,
          templates: current.templates.map((item) => {
            if (item.id !== editingId) return item;
            const contentChanged = item.body !== body || item.title !== title.trim();
            const versions = contentChanged
              ? [
                  { id: createId("tplver"), title: item.title, body: item.body, savedAt: now },
                  ...item.versions,
                ].slice(0, 20)
              : item.versions;
            return {
              ...item,
              title: title.trim(),
              body,
              versions,
              updatedAt: now,
            };
          }),
        }));
      } else {
        const template: DocumentTemplate = {
          id: createId("tpl"),
          title: title.trim(),
          body,
          versions: [],
          createdAt: now,
          updatedAt: now,
        };
        await updateData((current) => ({
          ...current,
          templates: [template, ...current.templates],
        }));
      }
      closeSheet();
    } catch {
      setNotice("تعذر حفظ القالب محلياً.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(template: DocumentTemplate) {
    const confirmed = await confirmDestructiveAction(
      "نقل القالب إلى سلة المحذوفات؟",
      `سينتقل قالب «${template.title}» وسجل نسخه السابق إلى السلة ويمكن استعادتهما.`,
      "نقل إلى السلة",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await updateData((current) => moveRecordToTrash(current, "template", template.id).data);
      setNotice(`نُقل قالب «${template.title}» إلى سلة المحذوفات.`);
    } catch {
      setNotice("تعذر نقل القالب إلى السلة.");
    } finally {
      setBusy(false);
    }
  }

  function openVersions(template: DocumentTemplate) {
    setHistoryTemplateId(template.id);
    setSheet("versions");
  }

  async function restoreVersion(versionId: string) {
    if (!historyTemplateId) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await updateData((current) => ({
        ...current,
        templates: current.templates.map((item) => {
          if (item.id !== historyTemplateId) return item;
          const version = item.versions.find(
            (candidate) => candidate.id === versionId,
          );
          if (!version || (version.body === item.body && (version.title ?? item.title) === item.title)) return item;
          return {
            ...item,
            title: version.title ?? item.title,
            body: version.body,
            updatedAt: now,
            versions: [
              { id: createId("tplver"), title: item.title, body: item.body, savedAt: now },
              ...item.versions,
            ].slice(0, 20),
          };
        }),
      }));
      setNotice("تمت استعادة النسخة السابقة؛ حُفظ النص الحالي ضمن السجل.");
    } catch {
      setNotice("تعذرت استعادة النسخة.");
    } finally {
      setBusy(false);
    }
  }

  function openDraft() {
    setDraftTemplateId("");
    setDraftClientId("");
    setDraftCaseId("");
    setNotice("");
    setSheet("draft");
  }

  function chooseDraftClient(clientId: string) {
    setDraftClientId(clientId);
    setDraftCaseId(
      data.cases.find((item) => item.clientId === clientId)?.id ?? "",
    );
  }

  async function shareDraftPdf() {
    if (!draftTemplate || !draftClient || !draftCase) {
      setNotice("اختر القالب والموكل والقضية قبل إنشاء المسودة.");
      return;
    }
    if (Platform.OS === "web") {
      setNotice(
        "إنشاء ومشاركة PDF متاحان في تطبيق الهاتف؛ معاينة الويب للعرض فقط.",
      );
      return;
    }
    setBusy(true);
    let pdfUri: string | null = null;
    try {
      const pdf = await Print.printToFileAsync({
        html: documentHtml(draftTemplate.title, draftedBody),
      });
      pdfUri = pdf.uri;
      const file = await FileSystem.getInfoAsync(pdfUri);
      if (!file.exists) throw new Error("pdf_missing");
      if (!(await Sharing.isAvailableAsync())) {
        setNotice("خدمة المشاركة غير متاحة على هذا الجهاز.");
        return;
      }
      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        dialogTitle: draftTemplate.title,
        UTI: "com.adobe.pdf",
      });
      setNotice(
        "تمت مشاركة PDF. الملف الناتج يُشارك كملف غير مشفر، وقد حُذف من التخزين المؤقت بعد الإرسال.",
      );
    } catch {
      setNotice("تعذر إنشاء PDF أو مشاركته.");
    } finally {
      if (pdfUri) await deleteTemporaryCacheFile(pdfUri);
      setBusy(false);
    }
  }

  return (
    <Page>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 18, paddingBottom: 30, gap: 16 }}
      >
        <View
          style={{
            flexDirection: "row-reverse",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.text,
                textAlign: "right",
                fontSize: 22,
                fontWeight: "800",
              }}
            >
              قوالب المستندات
            </Text>
            <Text
              style={{
                color: colors.muted,
                textAlign: "right",
                marginTop: 5,
                fontSize: 12,
              }}
            >
              قوالب محلية وسجل نسخ للمسودات
            </Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="رجوع"
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <MaterialCommunityIcons
              name="arrow-right"
              size={19}
              color={colors.text}
            />
            <Text
              style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}
            >
              رجوع
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button
              title="قالب جديد"
              onPress={openNewTemplate}
              icon={
                <MaterialCommunityIcons
                  name="file-plus-outline"
                  size={18}
                  color="#fff"
                />
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              title="مسودة PDF"
              secondary
              onPress={openDraft}
              icon={
                <MaterialCommunityIcons
                  name="file-pdf-box"
                  size={18}
                  color={colors.text}
                />
              }
            />
          </View>
        </View>

        {notice ? (
          <Pressable
            onPress={() => setNotice("")}
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: `${colors.tint}12`,
            }}
          >
            <Text
              style={{
                color: colors.text,
                textAlign: "right",
                fontSize: 12,
                lineHeight: 20,
              }}
            >
              {notice}
            </Text>
          </Pressable>
        ) : null}

        <View>
          <SectionTitle
            title={`القوالب (${data.templates.length})`}
            action="إضافة قالب"
            onAction={openNewTemplate}
          />
          {data.templates.length ? (
            <View style={{ gap: 9 }}>
              {data.templates.map((template) => (
                <Card key={template.id} style={{ padding: 15 }}>
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "flex-start",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        backgroundColor: `${colors.tint}16`,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MaterialCommunityIcons
                        name="file-document-edit-outline"
                        size={21}
                        color={colors.tint}
                      />
                    </View>
                    <Pressable
                      onPress={() => openEditTemplate(template)}
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={{
                          color: colors.text,
                          textAlign: "right",
                          fontWeight: "800",
                          fontSize: 15,
                        }}
                      >
                        {template.title}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={{
                          color: colors.muted,
                          textAlign: "right",
                          marginTop: 5,
                          fontSize: 12,
                          lineHeight: 19,
                        }}
                      >
                        {template.body || "قالب فارغ"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void deleteTemplate(template)}
                      disabled={busy}
                      accessibilityLabel={`حذف ${template.title}`}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <MaterialCommunityIcons
                        name="trash-can-outline"
                        size={20}
                        color={colors.error}
                      />
                    </Pressable>
                  </View>
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                      marginTop: 12,
                      paddingTop: 10,
                    }}
                  >
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {template.versions.length} نسخة سابقة ·{" "}
                      {formatDate(template.updatedAt)}
                    </Text>
                    <View style={{ flexDirection: "row-reverse", gap: 12 }}>
                      <Pressable
                        onPress={() => openVersions(template)}
                        accessibilityLabel="سجل النسخ"
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <MaterialCommunityIcons
                          name="history"
                          size={16}
                          color={colors.tint}
                        />
                        <Text
                          style={{
                            color: colors.tint,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          السجل
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => openEditTemplate(template)}
                        accessibilityLabel="تعديل القالب"
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <MaterialCommunityIcons
                          name="pencil-outline"
                          size={16}
                          color={colors.tint}
                        />
                        <Text
                          style={{
                            color: colors.tint,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          تعديل
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <Card>
              <EmptyState
                icon={
                  <MaterialCommunityIcons
                    name="file-document-outline"
                    size={25}
                    color={colors.muted}
                  />
                }
                title="لا توجد قوالب بعد"
                detail="أنشئ قالباً فارغاً أو أضف هيكلاً تجريبياً عاماً دون تضمين نصوص أو أحكام قانونية."
              />
            </Card>
          )}
        </View>

        <Card style={{ padding: 14, backgroundColor: `${colors.tint}0D` }}>
          <View
            style={{
              flexDirection: "row-reverse",
              gap: 9,
              alignItems: "flex-start",
            }}
          >
            <MaterialCommunityIcons
              name="information-outline"
              size={20}
              color={colors.tint}
            />
            <Text
              style={{
                flex: 1,
                color: colors.text,
                textAlign: "right",
                fontSize: 12,
                lineHeight: 20,
              }}
            >
              يستبدل منشئ المسودة بيانات الموكل والقضية تلقائياً. عند المشاركة،
              يُنشأ PDF كملف غير مشفر لتطبيق المشاركة المختار ثم يُحذف من
              التخزين المؤقت.
            </Text>
          </View>
        </Card>
      </ScrollView>

      <Modal
        visible={sheet === "editor"}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingSheet>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              maxHeight: "92%",
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 19,
                    fontWeight: "800",
                  }}
                >
                  {editingId ? "تعديل القالب" : "قالب جديد"}
                </Text>
                <Pressable onPress={closeSheet} accessibilityLabel="إغلاق">
                  <MaterialCommunityIcons
                    name="close"
                    size={23}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
              <Field
                label="اسم القالب"
                value={title}
                onChangeText={setTitle}
                placeholder="مثال: مسودة خطاب"
                returnKeyType="next"
              />
              <Field
                label="نص القالب"
                value={body}
                onChangeText={setBody}
                placeholder="يمكن ترك القالب فارغاً أو كتابة هيكل تجريبي فقط"
                multiline
              />
              <Text
                style={{
                  color: colors.muted,
                  textAlign: "right",
                  fontSize: 11,
                  lineHeight: 19,
                  marginTop: -3,
                  marginBottom: 12,
                }}
              >
                كل تغيير على الاسم أو النص يحفظ النسخة السابقة في السجل (بحد أقصى 20 نسخة).
              </Text>
              <Text
                style={{
                  color: colors.text,
                  textAlign: "right",
                  fontWeight: "700",
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                متغيرات متاحة
              </Text>
              <View
                style={{
                  flexDirection: "row-reverse",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 16,
                }}
              >
                {TOKENS.map((token) => (
                  <View
                    key={token}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                    }}
                  >
                    <Text style={{ color: colors.muted, fontSize: 10 }}>
                      {token}
                    </Text>
                  </View>
                ))}
              </View>
              {notice ? (
                <Text
                  style={{
                    color: colors.error,
                    textAlign: "right",
                    marginBottom: 12,
                  }}
                >
                  {notice}
                </Text>
              ) : null}
              <Button
                title={busy ? "جارٍ الحفظ…" : "حفظ القالب"}
                onPress={() => void saveTemplate()}
                disabled={busy}
                icon={
                  <MaterialCommunityIcons
                    name="content-save-outline"
                    size={18}
                    color="#fff"
                  />
                }
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingSheet>
      </Modal>

      <Modal
        visible={sheet === "versions"}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingSheet>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              maxHeight: "90%",
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 19,
                      fontWeight: "800",
                      textAlign: "right",
                    }}
                  >
                    سجل النسخ
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      textAlign: "right",
                      fontSize: 12,
                      marginTop: 3,
                    }}
                  >
                    {historyTemplate?.title ?? ""}
                  </Text>
                </View>
                <Pressable onPress={closeSheet} accessibilityLabel="إغلاق">
                  <MaterialCommunityIcons
                    name="close"
                    size={23}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
              {historyTemplate?.versions.length ? (
                <View style={{ gap: 9 }}>
                  {historyTemplate.versions.map((version, index) => (
                    <Card key={version.id} style={{ padding: 13 }}>
                      <Text
                        style={{
                          color: colors.text,
                          textAlign: "right",
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        نسخة سابقة {historyTemplate.versions.length - index}
                      </Text>
                      {version.title ? <Text style={{ color: colors.muted, textAlign: "right", fontSize: 11, marginTop: 4 }}>الاسم: {version.title}</Text> : null}
                      <Text
                        style={{
                          color: colors.muted,
                          textAlign: "right",
                          fontSize: 10,
                          marginTop: 3,
                        }}
                      >
                        {formatDate(version.savedAt)}
                      </Text>
                      <Text
                        numberOfLines={4}
                        style={{
                          color: colors.text,
                          textAlign: "right",
                          marginTop: 9,
                          fontSize: 12,
                          lineHeight: 20,
                        }}
                      >
                        {version.body || "(نص فارغ)"}
                      </Text>
                      <Pressable
                        onPress={() => void restoreVersion(version.id)}
                        disabled={busy}
                        style={{
                          flexDirection: "row-reverse",
                          alignSelf: "flex-start",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 10,
                        }}
                      >
                        <MaterialCommunityIcons
                          name="restore"
                          size={17}
                          color={colors.tint}
                        />
                        <Text
                          style={{
                            color: colors.tint,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          استعادة هذه النسخة
                        </Text>
                      </Pressable>
                    </Card>
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon={
                    <MaterialCommunityIcons
                      name="history"
                      size={24}
                      color={colors.muted}
                    />
                  }
                  title="لا توجد نسخ سابقة"
                  detail="سيظهر هنا النص السابق عند حفظ تعديل على محتوى القالب."
                />
              )}
              {notice ? (
                <Text
                  style={{
                    color: colors.tint,
                    textAlign: "right",
                    marginTop: 12,
                    lineHeight: 20,
                  }}
                >
                  {notice}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingSheet>
      </Modal>

      <Modal
        visible={sheet === "draft"}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingSheet>
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              maxHeight: "94%",
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <View>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 19,
                      fontWeight: "800",
                      textAlign: "right",
                    }}
                  >
                    إنشاء مسودة PDF
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: 11,
                      textAlign: "right",
                      marginTop: 3,
                    }}
                  >
                    اختر القالب والموكل والقضية
                  </Text>
                </View>
                <Pressable onPress={closeSheet} accessibilityLabel="إغلاق">
                  <MaterialCommunityIcons
                    name="close"
                    size={23}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
              <Text
                style={{
                  color: colors.text,
                  textAlign: "right",
                  fontWeight: "700",
                  marginBottom: 8,
                }}
              >
                القالب
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  flexDirection: "row-reverse",
                  gap: 7,
                  paddingBottom: 14,
                }}
              >
                {data.templates.map((template) => (
                  <Pressable
                    key={template.id}
                    onPress={() => setDraftTemplateId(template.id)}
                    style={{
                      paddingHorizontal: 11,
                      paddingVertical: 9,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor:
                        draftTemplateId === template.id
                          ? colors.tint
                          : colors.border,
                      backgroundColor:
                        draftTemplateId === template.id
                          ? `${colors.tint}18`
                          : colors.background,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 12 }}>
                      {template.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text
                style={{
                  color: colors.text,
                  textAlign: "right",
                  fontWeight: "700",
                  marginBottom: 8,
                }}
              >
                الموكل
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  flexDirection: "row-reverse",
                  gap: 7,
                  paddingBottom: 14,
                }}
              >
                {data.clients.map((client) => (
                  <Pressable
                    key={client.id}
                    onPress={() => chooseDraftClient(client.id)}
                    style={{
                      paddingHorizontal: 11,
                      paddingVertical: 9,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor:
                        draftClientId === client.id
                          ? colors.tint
                          : colors.border,
                      backgroundColor:
                        draftClientId === client.id
                          ? `${colors.tint}18`
                          : colors.background,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 12 }}>
                      {client.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text
                style={{
                  color: colors.text,
                  textAlign: "right",
                  fontWeight: "700",
                  marginBottom: 8,
                }}
              >
                القضية المرتبطة
              </Text>
              {draftClientId && availableDraftCases.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{
                    flexDirection: "row-reverse",
                    gap: 7,
                    paddingBottom: 14,
                  }}
                >
                  {availableDraftCases.map((legalCase) => (
                    <Pressable
                      key={legalCase.id}
                      onPress={() => setDraftCaseId(legalCase.id)}
                      style={{
                        paddingHorizontal: 11,
                        paddingVertical: 9,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor:
                          draftCaseId === legalCase.id
                            ? colors.tint
                            : colors.border,
                        backgroundColor:
                          draftCaseId === legalCase.id
                            ? `${colors.tint}18`
                            : colors.background,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 12 }}>
                        {legalCase.title}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <Text
                  style={{
                    color: colors.muted,
                    textAlign: "right",
                    fontSize: 12,
                    marginBottom: 14,
                  }}
                >
                  {draftClientId
                    ? "لا توجد قضية مرتبطة بهذا الموكل."
                    : "اختر موكلاً أولاً."}
                </Text>
              )}
              {draftTemplate && draftClient && draftCase ? (
                <Card style={{ padding: 14, marginTop: 4 }}>
                  <Text
                    style={{
                      color: colors.text,
                      textAlign: "right",
                      fontWeight: "800",
                      fontSize: 14,
                    }}
                  >
                    {draftTemplate.title}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      textAlign: "right",
                      marginTop: 4,
                      fontSize: 11,
                    }}
                  >
                    {draftClient.name} · {draftCase.title}
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      textAlign: "right",
                      marginTop: 12,
                      fontSize: 12,
                      lineHeight: 22,
                    }}
                  >
                    {draftedBody || "(القالب فارغ)"}
                  </Text>
                </Card>
              ) : (
                <Card style={{ marginTop: 4 }}>
                  <EmptyState
                    icon={
                      <MaterialCommunityIcons
                        name="file-search-outline"
                        size={24}
                        color={colors.muted}
                      />
                    }
                    title="أكمل الاختيارات"
                    detail="تتطلب المسودة قالباً وموكلاً وقضية مرتبطة به."
                  />
                </Card>
              )}
              <Text
                style={{
                  color: colors.warning,
                  textAlign: "right",
                  fontSize: 11,
                  lineHeight: 19,
                  marginTop: 14,
                  marginBottom: 12,
                }}
              >
                تنبيه: PDF الناتج يُشارك كملف غير مشفر مع تطبيق المشاركة الذي
                تختاره، ثم يُحذف من التخزين المؤقت.
              </Text>
              {notice ? (
                <Text
                  style={{
                    color: colors.error,
                    textAlign: "right",
                    marginBottom: 12,
                    lineHeight: 20,
                  }}
                >
                  {notice}
                </Text>
              ) : null}
              <Button
                title={busy ? "جارٍ إنشاء PDF…" : "إنشاء ومشاركة PDF"}
                onPress={() => void shareDraftPdf()}
                disabled={busy || !draftTemplate || !draftClient || !draftCase}
                icon={
                  <MaterialCommunityIcons
                    name="share-variant-outline"
                    size={18}
                    color="#fff"
                  />
                }
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingSheet>
      </Modal>
    </Page>
  );
}
