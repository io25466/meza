import type { Payment, PaymentMethod } from "./models";

export type ReceiptInput = {
  receiptNumber: string;
  clientName: string;
  caseTitle: string;
  caseNumber?: string;
  currency: string;
  payment: Pick<Payment, "amount" | "date" | "kind" | "method" | "note">;
};

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const methodLabel = (method?: PaymentMethod) => method ? ({ cash: "نقداً", bank_transfer: "تحويل مصرفي", card: "بطاقة", other: "أخرى" }[method]) : "غير محددة";

export function paymentReceiptHtml(input: ReceiptInput): string {
  const title = input.payment.kind === "advance" ? "إيصال قبض سلفة" : "إيصال قبض دفعة";
  const fields = [
    ["رقم الإيصال", input.receiptNumber],
    ["الموكل", input.clientName],
    ["القضية", `${input.caseTitle}${input.caseNumber ? ` — ${input.caseNumber}` : ""}`],
    ["تاريخ القبض", input.payment.date],
    ["طريقة القبض", methodLabel(input.payment.method)],
    ["المبلغ", `${new Intl.NumberFormat("ar-SY", { maximumFractionDigits: 2 }).format(input.payment.amount)} ${input.currency}`],
    ...(input.payment.note ? [["ملاحظة", input.payment.note]] : []),
  ];
  const rows = fields.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>@page{margin:20mm}body{font-family:Arial,sans-serif;color:#17263a;padding:18px}h1{text-align:center;color:#142b45;font-size:24px}.sub{text-align:center;color:#64748b;margin:6px 0 28px}table{width:100%;border-collapse:collapse}th,td{text-align:right;padding:13px 10px;border-bottom:1px solid #d9e0e9}th{width:32%;color:#546477;font-weight:500}.footer{margin-top:42px;color:#64748b;text-align:center;font-size:11px}</style></head><body><h1>ميزان</h1><div class="sub">${title}</div><table>${rows}</table><div class="footer">سجل شخصي أنشئ من تطبيق ميزان، ويظل أصله محفوظاً في الخزنة المحلية.</div></body></html>`;
}
