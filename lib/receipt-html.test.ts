import { describe, expect, it } from "vitest";
import { paymentReceiptHtml } from "./receipt-html";

describe("payment receipt HTML", () => {
  it("escapes user-controlled fields and labels the receipt in Arabic", () => {
    const html = paymentReceiptHtml({
      receiptNumber: "MZ-<1>",
      clientName: "<script>alert(1)</script>",
      caseTitle: "قضية & مطالبة",
      caseNumber: "123",
      currency: "ل.س",
      payment: { amount: 1250, date: "2026-10-20", kind: "installment", method: "cash", note: "ملاحظة 'آمنة'" },
    });
    expect(html).toContain("إيصال قبض دفعة");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("نقداً");
    expect(html).toContain("MZ-&lt;1&gt;");
  });

  it("does not invent a payment method when the record has none", () => {
    const html = paymentReceiptHtml({
      receiptNumber: "MZ-2",
      clientName: "موكل",
      caseTitle: "قضية",
      currency: "ل.س",
      payment: { amount: 10, date: "2026-10-20", kind: "advance" },
    });
    expect(html).toContain("إيصال قبض سلفة");
    expect(html).toContain("غير محددة");
  });
});
