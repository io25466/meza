import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { KeyboardAvoidingSheet } from "@/components/keyboard-avoiding-sheet";
import { AppText as Text } from "@/components/app-text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/use-colors";
import { useAppData } from "@/lib/app-data";
import { createId, isValidISODate, paymentStatus, remainingBalance, totalPaid, type OfficeExpense, type Payment, type PaymentMethod } from "@/lib/models";
import { todayISO } from "@/lib/notifications";
import { monthlyFinancialReport } from "@/lib/financial-reports";
import { confirmDestructiveAction } from "@/lib/confirm";
import { addAuditEntry, auditExpenseChange, auditPaymentChange, financialAuditActionLabel, financialAuditKindLabel } from "@/lib/financial-audit";
import { moveRecordToTrash } from "@/lib/trash";
import { sharePaymentReceipt } from "@/lib/receipt";
import { Button, Card, EmptyState, Field, Page, Pill, SectionTitle } from "@/components/ui";

const currencies = ["ل.س (جديدة)", "ل.س (قديمة)", "ر.س", "د.إ", "د.ك", "ر.ق", "د.ب", "ر.ع", "ج.م", "د.أ", "USD", "EUR"];
const expenseCategories = ["تنقل", "رسوم حكومية", "اتصالات", "مستلزمات", "إيجار", "أخرى"];
const paymentMethods: { id: PaymentMethod; label: string }[] = [{ id: "cash", label: "نقداً" }, { id: "bank_transfer", label: "تحويل" }, { id: "card", label: "بطاقة" }, { id: "other", label: "أخرى" }];
const amountLabel = (value: number, currency: string) => `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(value)} ${currency}`;
const currentMonth = () => todayISO().slice(0, 7);

export default function FinanceScreen() {
  const colors = useColors();
  const { data, updateData } = useAppData();
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [expenseVisible, setExpenseVisible] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [caseId, setCaseId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [correctionReason, setCorrectionReason] = useState("");
  const [receiptBusyId, setReceiptBusyId] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [expenseCategory, setExpenseCategory] = useState("تنقل");
  const [expenseNote, setExpenseNote] = useState("");
  const [expenseClientId, setExpenseClientId] = useState("");
  const [expenseCaseId, setExpenseCaseId] = useState("");
  const [reportMonth, setReportMonth] = useState(currentMonth());
  const [error, setError] = useState("");
  const totalFees = data.cases.reduce((sum, item) => sum + item.totalFees, 0);
  const paid = data.cases.reduce((sum, item) => sum + totalPaid(item, data.payments), 0);
  const due = data.cases.reduce((sum, item) => sum + remainingBalance(item, data.payments), 0);
  const report = useMemo(() => monthlyFinancialReport(data, reportMonth), [data, reportMonth]);
  const sortedPayments = useMemo(() => [...data.payments].sort((a, b) => b.date.localeCompare(a.date)), [data.payments]);
  const sortedExpenses = useMemo(() => [...data.expenses].sort((a, b) => b.date.localeCompare(a.date)), [data.expenses]);

  function openPayment(id?: string) {
    const existing = data.payments.find((item) => item.id === id);
    setEditingPaymentId(existing?.id ?? null);
    setCaseId(existing?.caseId ?? id ?? data.cases.find((item) => remainingBalance(item, data.payments) > 0)?.id ?? "");
    setAmount(existing ? String(existing.amount) : "");
    setDate(existing?.date ?? todayISO());
    setNote(existing?.note ?? "");
    setPaymentMethod(existing?.method ?? "cash");
    setCorrectionReason("");
    setError("");
    setPaymentVisible(true);
  }

  function closePayment() {
    setPaymentVisible(false);
    setEditingPaymentId(null);
    setAmount("");
    setNote("");
    setPaymentMethod("cash");
    setCorrectionReason("");
    setError("");
  }

  async function savePayment() {
    const value = Number(amount);
    const legalCase = data.cases.find((item) => item.id === caseId);
    if (!legalCase) { setError("اختر القضية أولاً."); return; }
    const oldPayment = data.payments.find((item) => item.id === editingPaymentId);
    const paymentsWithoutEdited = oldPayment ? data.payments.filter((item) => item.id !== oldPayment.id) : data.payments;
    const balance = remainingBalance(legalCase, paymentsWithoutEdited);
    if (!isValidISODate(date)) { setError("أدخل تاريخ دفع صحيحاً بصيغة YYYY-MM-DD."); return; }
    if (!Number.isFinite(value) || value <= 0 || value > balance) { setError(`أدخل مبلغاً صحيحاً لا يتجاوز المتبقي ${amountLabel(balance, data.currency)}.`); return; }
    const payment: Payment = { id: oldPayment?.id ?? createId("pay"), caseId, amount: value, date, kind: "installment", method: paymentMethod, note: note.trim() || undefined };
    try {
      const audit = auditPaymentChange(oldPayment, payment, legalCase.clientId, oldPayment ? correctionReason.trim() || "تصحيح بيانات الدفعة" : undefined);
      await updateData((current) => addAuditEntry({ ...current, payments: oldPayment ? current.payments.map((item) => item.id === payment.id ? payment : item) : [...current.payments, payment] }, audit));
      closePayment();
    } catch { setError("تعذر حفظ الدفعة في الخزنة."); }
  }

  async function deletePayment(payment: Payment) {
    const confirmed = await confirmDestructiveAction("إلغاء الدفعة ونقلها إلى السلة؟", `ستُسجل حركة إلغاء مالية لقسط ${amountLabel(payment.amount, data.currency)} بتاريخ ${payment.date}، وتُنقل تفاصيله إلى سلة المحذوفات بدلاً من محوها مباشرة.`, "إلغاء ونقل");
    if (!confirmed) return;
    try {
      const linkedCase = data.cases.find((item) => item.id === payment.caseId);
      const audit = auditPaymentChange(payment, undefined, linkedCase?.clientId, "إلغاء بعد موافقة المستخدم");
      await updateData((current) => addAuditEntry(moveRecordToTrash(current, "payment", payment.id).data, audit));
    } catch { setError("تعذر إلغاء الدفعة ونقلها إلى السلة."); }
  }

  async function shareReceipt(payment: Payment, caseTitle: string, caseNumber: string | undefined, clientName: string) {
    setReceiptBusyId(payment.id); setError("");
    try {
      const suffix = payment.id.replace(/[^a-zA-Z0-9]/g, "").slice(-10).toUpperCase() || "LOCAL";
      await sharePaymentReceipt({ receiptNumber: `MZ-${suffix}`, clientName, caseTitle, caseNumber, currency: data.currency, payment });
    } catch (receiptError) {
      setError(receiptError instanceof Error ? receiptError.message : "تعذر إنشاء الإيصال أو مشاركته.");
    } finally { setReceiptBusyId(""); }
  }

  function openExpense(expense?: OfficeExpense) {
    setEditingExpenseId(expense?.id ?? null);
    setExpenseAmount(expense ? String(expense.amount) : "");
    setExpenseDate(expense?.date ?? todayISO());
    setExpenseCategory(expense?.category ?? "تنقل");
    setExpenseNote(expense?.note ?? "");
    setExpenseCaseId(expense?.caseId ?? "");
    setExpenseClientId(expense?.clientId ?? "");
    setError("");
    setExpenseVisible(true);
  }

  function closeExpense() { setExpenseVisible(false); setEditingExpenseId(null); setError(""); }

  async function saveExpense() {
    const value = Number(expenseAmount);
    const linkedCase = data.cases.find((item) => item.id === expenseCaseId);
    if (!Number.isFinite(value) || value <= 0) { setError("أدخل مبلغ مصروف صحيحاً أكبر من صفر."); return; }
    if (!isValidISODate(expenseDate) || !expenseCategory.trim()) { setError("أدخل تاريخاً صحيحاً وتصنيفاً للمصروف."); return; }
    if (expenseCaseId && !linkedCase) { setError("القضية المختارة غير موجودة؛ حدّث الصفحة وأعد الاختيار."); return; }
    const expense: OfficeExpense = {
      id: editingExpenseId ?? createId("expense"),
      amount: value,
      date: expenseDate,
      category: expenseCategory.trim(),
      note: expenseNote.trim() || undefined,
      clientId: (linkedCase?.clientId ?? expenseClientId) || undefined,
      caseId: linkedCase?.id,
      createdAt: data.expenses.find((item) => item.id === editingExpenseId)?.createdAt ?? new Date().toISOString(),
    };
    try {
      const oldExpense = data.expenses.find((item) => item.id === editingExpenseId);
      const audit = auditExpenseChange(oldExpense, expense, oldExpense ? "تصحيح بيانات المصروف" : undefined);
      await updateData((current) => addAuditEntry({ ...current, expenses: editingExpenseId ? current.expenses.map((item) => item.id === expense.id ? expense : item) : [expense, ...current.expenses] }, audit));
      closeExpense();
    } catch { setError("تعذر حفظ المصروف في الخزنة."); }
  }

  async function deleteExpense(expense: OfficeExpense) {
    const confirmed = await confirmDestructiveAction("إلغاء المصروف ونقله إلى السلة؟", `سيُسجل إلغاء ${expense.category} بمبلغ ${amountLabel(expense.amount, data.currency)} بتاريخ ${expense.date}، وتُنقل تفاصيله إلى سلة المحذوفات.`, "إلغاء ونقل");
    if (!confirmed) return;
    try {
      const audit = auditExpenseChange(expense, undefined, "إلغاء بعد موافقة المستخدم");
      await updateData((current) => addAuditEntry(moveRecordToTrash(current, "expense", expense.id).data, audit));
    } catch { setError("تعذر إلغاء المصروف ونقله إلى السلة."); }
  }

  const monthLabel = new Date(`${reportMonth}-01T12:00:00`).toLocaleDateString("ar-SA", { month: "long", year: "numeric" });

  return <Page>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 32, gap: 17 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }}>
        <View><Text style={{ color: colors.text, textAlign: "right", fontSize: 22, fontWeight: "800" }}>المتابعة المالية</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 5 }}>الأتعاب والمقبوضات والمصروفات</Text><Pressable onPress={() => setCurrencyOpen(true)} style={{ alignSelf: "flex-start", marginTop: 7, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: `${colors.tint}14` }}><Text style={{ color: colors.tint, fontSize: 11, fontWeight: "700" }}>العملة · {data.currency}</Text></Pressable></View>
        <View style={{ gap: 7 }}><Pressable onPress={() => openPayment()} accessibilityLabel="تسجيل دفعة" style={{ width: 43, height: 43, borderRadius: 14, backgroundColor: colors.tint, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name="cash-plus" size={22} color="#fff" /></Pressable><Pressable onPress={() => openExpense()} accessibilityLabel="إضافة مصروف" style={{ width: 43, height: 43, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name="receipt-text-plus-outline" size={21} color={colors.tint} /></Pressable></View>
      </View>

      <Card style={{ backgroundColor: colors.tint, borderColor: colors.tint }}><Text style={{ color: "#FFFFFFBB", textAlign: "right", fontSize: 12 }}>إجمالي المستحقات المتبقية</Text><Text style={{ color: "#fff", textAlign: "right", fontWeight: "800", fontSize: 27, marginVertical: 8 }}>{amountLabel(due, data.currency)}</Text><View style={{ height: 1, backgroundColor: "#FFFFFF30", marginVertical: 8 }} /><View style={{ flexDirection: "row-reverse", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><Text style={{ color: "#FFFFFFDD", fontSize: 12 }}>إجمالي الأتعاب {amountLabel(totalFees, data.currency)}</Text><Text style={{ color: "#FFFFFFDD", fontSize: 12 }}>المسدّد {amountLabel(paid, data.currency)}</Text></View></Card>

      <View>
        <SectionTitle title="الأتعاب حسب القضية" action="إضافة قسط" onAction={() => openPayment()} />
        {data.cases.length ? <View style={{ gap: 9 }}>{data.cases.map((legalCase) => {
          const client = data.clients.find((item) => item.id === legalCase.clientId);
          const balance = remainingBalance(legalCase, data.payments);
          const status = paymentStatus(legalCase, data.payments);
          const paidAmount = totalPaid(legalCase, data.payments);
          return <Card key={legalCase.id}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start" }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "800", fontSize: 15 }}>{legalCase.title}</Text><Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 12 }}>{client?.name ?? "موكل غير محدد"} · {legalCase.type}</Text></View><Pill label={status === "paid" ? "مدفوع بالكامل" : status === "partial" ? "مدفوع جزئياً" : "لم يدفع"} color={status === "paid" ? colors.success : status === "partial" ? colors.tint : colors.warning} /></View>
            <View style={{ marginTop: 14, gap: 7 }}>{[
              ["إجمالي الأتعاب", legalCase.totalFees, colors.text],
              ["السلفة", legalCase.advancePayment, colors.text],
              ["إجمالي المدفوع", paidAmount, colors.success],
              ["المتبقي", balance, balance ? colors.warning : colors.success],
            ].map(([label, value, color]) => <View key={String(label)} style={{ flexDirection: "row-reverse", justifyContent: "space-between" }}><Text style={{ color: colors.muted, fontSize: 12 }}>{String(label)}</Text><Text style={{ color: String(color), fontSize: 12, fontWeight: label === "المتبقي" ? "800" : "600" }}>{amountLabel(Number(value), data.currency)}</Text></View>)}</View>
            <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {balance > 0 ? <Pressable onPress={() => openPayment(legalCase.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, backgroundColor: `${colors.tint}16`, flexDirection: "row-reverse", alignItems: "center", gap: 5 }}><MaterialCommunityIcons name="plus" size={16} color={colors.tint} /><Text style={{ color: colors.tint, fontWeight: "700", fontSize: 12 }}>تسجيل قسط</Text></Pressable> : null}
              {legalCase.advancePayment > 0 ? <Pressable onPress={() => void shareReceipt({ id: `advance_${legalCase.id}`, caseId: legalCase.id, amount: legalCase.advancePayment, date: legalCase.advancePaymentDate ?? legalCase.createdAt.slice(0, 10), kind: "advance", note: "السلفة المقدمة" }, legalCase.title, legalCase.caseNumber, client?.name ?? "موكل غير محدد")} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, backgroundColor: `${colors.success}16`, flexDirection: "row-reverse", alignItems: "center", gap: 5 }}><MaterialCommunityIcons name="file-pdf-box" size={16} color={colors.success} /><Text style={{ color: colors.success, fontWeight: "700", fontSize: 12 }}>إيصال السلفة</Text></Pressable> : null}
            </View>
          </Card>;
        })}</View> : <Card><EmptyState icon={<MaterialCommunityIcons name="wallet-outline" size={24} color={colors.muted} />} title="لا توجد أتعاب مسجلة" detail="أنشئ قضية وسجّل إجمالي الأتعاب والسلفة من قسم القضايا." /></Card>}
      </View>

      <View>
        <SectionTitle title="التقرير المالي" />
        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><Pressable onPress={() => { const [year, month] = reportMonth.split("-").map(Number); const previous = new Date(year, month - 2, 1); setReportMonth(`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}`); }} accessibilityLabel="الشهر السابق"><MaterialCommunityIcons name="chevron-right" size={23} color={colors.text} /></Pressable><Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>{monthLabel}</Text><Pressable onPress={() => { const [year, month] = reportMonth.split("-").map(Number); const next = new Date(year, month, 1); setReportMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); }} accessibilityLabel="الشهر التالي"><MaterialCommunityIcons name="chevron-left" size={23} color={colors.text} /></Pressable></View>
          <View style={{ flexDirection: "row-reverse", gap: 8 }}>{[
            { title: "المقبوضات", value: report.receipts, color: colors.success, icon: "cash-check" },
            { title: "المصروفات", value: report.expenses, color: colors.warning, icon: "cash-minus" },
            { title: "المتأخرات الحالية", value: report.outstanding, color: colors.tint, icon: "cash-clock" },
          ].map((item) => <View key={item.title} style={{ flex: 1, padding: 10, borderRadius: 13, backgroundColor: colors.background }}><MaterialCommunityIcons name={item.icon as never} size={17} color={item.color} /><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 5 }}>{item.title}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={{ color: item.color, textAlign: "right", fontSize: 12, fontWeight: "800", marginTop: 4 }}>{amountLabel(item.value, data.currency)}</Text></View>)}</View>
          {report.estimatedLegacyAdvances > 0 ? <View style={{ flexDirection: "row-reverse", gap: 6, marginTop: 10 }}><MaterialCommunityIcons name="information-outline" size={16} color={colors.warning} /><Text style={{ flex: 1, color: colors.muted, textAlign: "right", fontSize: 10, lineHeight: 16 }}>يشمل المقبوضات سلفاً قديمة بلا تاريخ قبض؛ أُدرجت تقديرياً بتاريخ تسجيل القضية بمجموع {amountLabel(report.estimatedLegacyAdvances, data.currency)}.</Text></View> : null}
          <SectionTitle title="التفصيل حسب الموكل" />
          {report.byClient.length ? <View style={{ gap: 8 }}>{report.byClient.map((row) => <View key={row.clientId ?? "unlinked"} style={{ padding: 11, borderRadius: 12, backgroundColor: colors.background }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "800", fontSize: 12 }}>{row.clientName}</Text><View style={{ flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "space-between", gap: 6, marginTop: 7 }}><Text style={{ color: colors.success, fontSize: 10 }}>مقبوض {amountLabel(row.receipts, data.currency)}</Text><Text style={{ color: colors.warning, fontSize: 10 }}>متبقي {amountLabel(row.outstanding, data.currency)}</Text><Text style={{ color: colors.tint, fontSize: 10 }}>مصروف {amountLabel(row.expenses, data.currency)}</Text></View></View>)}</View> : <Text style={{ color: colors.muted, textAlign: "right", fontSize: 12 }}>لا توجد سجلات لهذا الشهر.</Text>}
        </Card>
      </View>

      <View>
        <SectionTitle title="سجل التدقيق المالي" />
        {data.financialAudit.length ? <Card style={{ paddingVertical: 4 }}>{data.financialAudit.slice(0, 15).map((entry, index) => {
          const linkedCase = entry.caseId ? data.cases.find((item) => item.id === entry.caseId) : undefined;
          const clientName = data.clients.find((item) => item.id === (entry.clientId ?? linkedCase?.clientId))?.name;
          const prior = entry.before?.amount;
          const next = entry.after?.amount;
          return <View key={entry.id} style={{ paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: index === Math.min(data.financialAudit.length, 15) - 1 ? 0 : 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", gap: 8 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12 }}>{financialAuditActionLabel(entry.action)} · {financialAuditKindLabel(entry.kind)}</Text><Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(entry.createdAt).toLocaleDateString("ar-SY")}</Text></View>
            <Text style={{ color: colors.muted, textAlign: "right", marginTop: 4, fontSize: 10 }}>{linkedCase?.title ?? (clientName || "سجل مالي")} {clientName ? `· ${clientName}` : ""}</Text>
            <Text style={{ color: colors.tint, textAlign: "right", marginTop: 4, fontSize: 10 }}>{prior !== undefined ? `قبل ${amountLabel(prior, data.currency)}${next !== undefined ? ` ← بعد ${amountLabel(next, data.currency)}` : ""}` : next !== undefined ? `المبلغ ${amountLabel(next, data.currency)}` : ""}{entry.reason ? ` · ${entry.reason}` : ""}</Text>
          </View>;
        })}</Card> : <Card><Text style={{ color: colors.muted, textAlign: "right", fontSize: 12 }}>ستظهر هنا عمليات التسجيل والتصحيح والإلغاء؛ لا تُستبدل الحركة القديمة عند تعديلها.</Text></Card>}
      </View>

      <View>
        <SectionTitle title="سجل الأقساط" />
        {sortedPayments.length ? <Card style={{ paddingVertical: 4 }}>{sortedPayments.map((payment, index) => {
          const linkedCase = data.cases.find((item) => item.id === payment.caseId);
          const client = linkedCase ? data.clients.find((item) => item.id === linkedCase.clientId) : undefined;
          return <View key={payment.id} style={{ paddingVertical: 11, borderBottomWidth: index === sortedPayments.length - 1 ? 0 : 1, borderBottomColor: colors.border, flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
            <View style={{ width: 35, height: 35, borderRadius: 12, backgroundColor: `${colors.success}18`, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name="check" size={18} color={colors.success} /></View>
            <View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12 }}>{linkedCase?.title ?? "قضية"}</Text><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 3 }}>{client?.name ?? "موكل"} · {payment.date}{payment.note ? ` · ${payment.note}` : ""}</Text></View>
            <View style={{ alignItems: "flex-end", gap: 3 }}><Text style={{ color: colors.success, fontWeight: "800", fontSize: 12 }}>+{amountLabel(payment.amount, data.currency)}</Text><View style={{ flexDirection: "row-reverse" }}><Pressable onPress={() => void shareReceipt(payment, linkedCase?.title ?? "قضية", linkedCase?.caseNumber, client?.name ?? "موكل غير محدد")} accessibilityLabel="مشاركة إيصال الدفعة" hitSlop={6} style={{ padding: 3 }}><MaterialCommunityIcons name={receiptBusyId === payment.id ? "progress-clock" : "file-pdf-box"} size={16} color={colors.success} /></Pressable><Pressable onPress={() => openPayment(payment.id)} accessibilityLabel="تعديل القسط" hitSlop={6} style={{ padding: 3 }}><MaterialCommunityIcons name="pencil-outline" size={16} color={colors.tint} /></Pressable><Pressable onPress={() => void deletePayment(payment)} accessibilityLabel="إلغاء القسط" hitSlop={6} style={{ padding: 3 }}><MaterialCommunityIcons name="delete-outline" size={16} color={colors.error} /></Pressable></View></View>
          </View>;
        })}</Card> : <Card><EmptyState icon={<MaterialCommunityIcons name="receipt-text-outline" size={24} color={colors.muted} />} title="لا توجد أقساط مسجلة" detail="سجّل الدفعة وتاريخها من بطاقة القضية." /></Card>}
      </View>

      <View>
        <SectionTitle title="المصروفات" action="إضافة مصروف" onAction={() => openExpense()} />
        {sortedExpenses.length ? <Card style={{ paddingVertical: 4 }}>{sortedExpenses.map((expense, index) => {
          const linkedCase = expense.caseId ? data.cases.find((item) => item.id === expense.caseId) : undefined;
          const clientName = data.clients.find((item) => item.id === (expense.clientId ?? linkedCase?.clientId))?.name;
          return <View key={expense.id} style={{ paddingVertical: 11, borderBottomWidth: index === sortedExpenses.length - 1 ? 0 : 1, borderBottomColor: colors.border, flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
            <View style={{ width: 35, height: 35, borderRadius: 12, backgroundColor: `${colors.warning}18`, alignItems: "center", justifyContent: "center" }}><MaterialCommunityIcons name="receipt-text-outline" size={18} color={colors.warning} /></View>
            <View style={{ flex: 1 }}><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", fontSize: 12 }}>{expense.category}{clientName ? ` · ${clientName}` : ""}</Text><Text style={{ color: colors.muted, textAlign: "right", fontSize: 10, marginTop: 3 }}>{expense.date}{linkedCase ? ` · ${linkedCase.title}` : ""}{expense.note ? ` · ${expense.note}` : ""}</Text></View>
            <View style={{ alignItems: "flex-end", gap: 3 }}><Text style={{ color: colors.warning, fontWeight: "800", fontSize: 12 }}>−{amountLabel(expense.amount, data.currency)}</Text><View style={{ flexDirection: "row-reverse" }}><Pressable onPress={() => openExpense(expense)} accessibilityLabel="تعديل المصروف" hitSlop={6} style={{ padding: 3 }}><MaterialCommunityIcons name="pencil-outline" size={16} color={colors.tint} /></Pressable><Pressable onPress={() => void deleteExpense(expense)} accessibilityLabel="حذف المصروف" hitSlop={6} style={{ padding: 3 }}><MaterialCommunityIcons name="delete-outline" size={16} color={colors.error} /></Pressable></View></View>
          </View>;
        })}</Card> : <Card><EmptyState icon={<MaterialCommunityIcons name="receipt-text-outline" size={24} color={colors.muted} />} title="لا توجد مصروفات مسجلة" detail="أضف المصروف لعرضه في تقرير الشهر والموكل." /></Card>}
      </View>

      {error ? <Card style={{ borderColor: colors.error }}><Text style={{ color: colors.error, textAlign: "right", fontSize: 12 }}>{error}</Text></Card> : null}
      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, backgroundColor: `${colors.warning}14` }}><MaterialCommunityIcons name="information-outline" size={18} color={colors.warning} /><Text style={{ color: colors.muted, flex: 1, textAlign: "right", fontSize: 11 }}>يُحتسب المتبقي تلقائياً من إجمالي الأتعاب مطروحاً منه السلفة والأقساط المسجلة.</Text></View>
    </ScrollView>

    <Modal visible={paymentVisible} transparent animationType="slide" onRequestClose={closePayment}><KeyboardAvoidingSheet><View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%", padding: 20 }}><ScrollView keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 16 }}><Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{editingPaymentId ? "تعديل القسط" : "تسجيل دفعة"}</Text><Pressable onPress={closePayment}><MaterialCommunityIcons name="close" size={23} color={colors.muted} /></Pressable></View>
      <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 9 }}>القضية</Text>
      <View style={{ gap: 8, marginBottom: 12 }}>{data.cases.filter((item) => remainingBalance(item, data.payments.filter((payment) => payment.id !== editingPaymentId)) > 0 || item.id === caseId).map((item) => { const client = data.clients.find((record) => record.id === item.clientId); const excluded = data.payments.filter((payment) => payment.id !== editingPaymentId); return <Pressable key={item.id} onPress={() => setCaseId(item.id)} style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: caseId === item.id ? colors.tint : colors.border, backgroundColor: caseId === item.id ? `${colors.tint}12` : colors.background, flexDirection: "row-reverse", justifyContent: "space-between" }}><Text style={{ color: colors.text }}>{item.title} · {client?.name}</Text><Text style={{ color: colors.warning }}>{amountLabel(remainingBalance(item, excluded), data.currency)}</Text></Pressable>; })}</View>
      <View style={{ flexDirection: "row-reverse", gap: 10 }}><View style={{ flex: 1 }}><Field label="مبلغ القسط" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" /></View><View style={{ flex: 1 }}><Field label="تاريخ الدفع" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" /></View></View>
      <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>طريقة القبض</Text>
      <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>{paymentMethods.map((item) => <Pressable key={item.id} onPress={() => setPaymentMethod(item.id)} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, borderWidth: 1, borderColor: paymentMethod === item.id ? colors.tint : colors.border, backgroundColor: paymentMethod === item.id ? `${colors.tint}15` : colors.background }}><Text style={{ color: paymentMethod === item.id ? colors.tint : colors.text, fontSize: 11, fontWeight: "700" }}>{item.label}</Text></Pressable>)}</View>
      <Field label="ملاحظة (اختياري)" value={note} onChangeText={setNote} placeholder="بيان أو مرجع التحويل" />
      {editingPaymentId ? <Field label="سبب التصحيح (اختياري)" value={correctionReason} onChangeText={setCorrectionReason} placeholder="يظهر في سجل التدقيق" /> : null}
      {error ? <Text style={{ color: colors.error, textAlign: "right", marginBottom: 12 }}>{error}</Text> : null}
      <Button title={editingPaymentId ? "حفظ تعديلات القسط" : "حفظ الدفعة"} onPress={() => void savePayment()} />
    </ScrollView></View></KeyboardAvoidingSheet></Modal>

    <Modal visible={expenseVisible} transparent animationType="slide" onRequestClose={closeExpense}><KeyboardAvoidingSheet><View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", padding: 20 }}><ScrollView keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 16 }}><Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{editingExpenseId ? "تعديل المصروف" : "إضافة مصروف"}</Text><Pressable onPress={closeExpense}><MaterialCommunityIcons name="close" size={23} color={colors.muted} /></Pressable></View>
      <View style={{ flexDirection: "row-reverse", gap: 10 }}><View style={{ flex: 1 }}><Field label="المبلغ" value={expenseAmount} onChangeText={setExpenseAmount} keyboardType="decimal-pad" placeholder="0" /></View><View style={{ flex: 1 }}><Field label="التاريخ" value={expenseDate} onChangeText={setExpenseDate} placeholder="YYYY-MM-DD" /></View></View>
      <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>التصنيف</Text><View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>{expenseCategories.map((category) => <Pressable key={category} onPress={() => setExpenseCategory(category)} style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13, borderWidth: 1, borderColor: expenseCategory === category ? colors.tint : colors.border, backgroundColor: expenseCategory === category ? `${colors.tint}15` : colors.background }}><Text style={{ color: expenseCategory === category ? colors.tint : colors.text, fontSize: 11, fontWeight: "700" }}>{category}</Text></Pressable>)}</View>
      <Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>ربط بالقضية (اختياري)</Text><View style={{ gap: 7, marginBottom: 12 }}><Pressable onPress={() => setExpenseCaseId("")} style={{ padding: 10, borderRadius: 11, borderWidth: 1, borderColor: !expenseCaseId ? colors.tint : colors.border, backgroundColor: !expenseCaseId ? `${colors.tint}12` : colors.background }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 12 }}>بدون قضية</Text></Pressable>{data.cases.map((item) => <Pressable key={item.id} onPress={() => { setExpenseCaseId(item.id); setExpenseClientId(item.clientId); }} style={{ padding: 10, borderRadius: 11, borderWidth: 1, borderColor: expenseCaseId === item.id ? colors.tint : colors.border, backgroundColor: expenseCaseId === item.id ? `${colors.tint}12` : colors.background }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 12 }}>{item.title} · {data.clients.find((client) => client.id === item.clientId)?.name}</Text></Pressable>)}</View>
      {!expenseCaseId ? <><Text style={{ color: colors.text, textAlign: "right", fontWeight: "700", marginBottom: 8 }}>الموكل (اختياري)</Text><View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 12 }}><Pressable onPress={() => setExpenseClientId("")} style={{ padding: 9, borderRadius: 11, backgroundColor: !expenseClientId ? colors.tint : colors.background }}><Text style={{ color: !expenseClientId ? "#fff" : colors.text, fontSize: 11 }}>غير مرتبط</Text></Pressable>{data.clients.map((client) => <Pressable key={client.id} onPress={() => setExpenseClientId(client.id)} style={{ padding: 9, borderRadius: 11, backgroundColor: expenseClientId === client.id ? colors.tint : colors.background, borderWidth: 1, borderColor: expenseClientId === client.id ? colors.tint : colors.border }}><Text style={{ color: expenseClientId === client.id ? "#fff" : colors.text, fontSize: 11 }}>{client.name}</Text></Pressable>)}</View></> : null}
      <Field label="ملاحظة (اختياري)" value={expenseNote} onChangeText={setExpenseNote} placeholder="تفاصيل المصروف" />
      {error ? <Text style={{ color: colors.error, textAlign: "right", marginBottom: 12 }}>{error}</Text> : null}
      <Button title={editingExpenseId ? "حفظ تعديلات المصروف" : "حفظ المصروف"} onPress={() => void saveExpense()} />
    </ScrollView></View></KeyboardAvoidingSheet></Modal>

    <Modal visible={currencyOpen} transparent animationType="fade" onRequestClose={() => setCurrencyOpen(false)}><View style={{ flex: 1, backgroundColor: "#0007", justifyContent: "center", padding: 26 }}><View style={{ backgroundColor: colors.surface, borderRadius: 22, padding: 18 }}><Text style={{ color: colors.text, textAlign: "right", fontSize: 18, fontWeight: "800", marginBottom: 12 }}>اختر العملة</Text>{currencies.map((currency) => <Pressable key={currency} onPress={() => { void updateData((current) => ({ ...current, currency })); setCurrencyOpen(false); }} style={{ padding: 13, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row-reverse", justifyContent: "space-between" }}><Text style={{ color: colors.text }}>{currency}</Text>{currency === data.currency ? <MaterialCommunityIcons name="check" size={19} color={colors.tint} /> : null}</Pressable>)}</View></View></Modal>
  </Page>;
}
