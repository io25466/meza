import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { deleteTemporaryCacheFile } from "./secure-vault";
import { paymentReceiptHtml, type ReceiptInput } from "./receipt-html";
export { paymentReceiptHtml } from "./receipt-html";
export type { ReceiptInput } from "./receipt-html";

export async function sharePaymentReceipt(input: ReceiptInput): Promise<void> {
  if (Platform.OS === "web") throw new Error("إنشاء الإيصال ومشاركته متاحان في تطبيق الهاتف فقط.");
  let uri: string | null = null;
  try {
    const result = await Print.printToFileAsync({ html: paymentReceiptHtml(input) });
    uri = result.uri;
    if (!(await Sharing.isAvailableAsync())) throw new Error("خدمة مشاركة الملفات غير متاحة على الجهاز.");
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: `إيصال ميزان ${input.receiptNumber}`, UTI: "com.adobe.pdf" });
  } finally {
    if (uri) await deleteTemporaryCacheFile(uri);
  }
}
