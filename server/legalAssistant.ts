import { z } from "zod";

export const legalAssistantInputSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(5, "اكتب سؤالاً قانونياً واضحاً لا يقل عن خمسة أحرف.")
      .max(4_000, "اختصر السؤال إلى 4000 حرف كحد أقصى."),
    excerpts: z
      .array(z.string().trim().min(1, "لا يمكن إرسال مادة فارغة.").max(12_000, "اختصر كل مادة إلى 12000 حرف كحد أقصى."))
      .max(3, "يمكن إرسال ثلاث مواد قانونية كحد أقصى."),
  })
  .strict()
  .refine((input) => input.excerpts.reduce((total, excerpt) => total + excerpt.length, 0) <= 24_000, {
    message: "اختصر المواد المحددة إلى 24000 حرف إجمالاً كحد أقصى.",
  });

export type LegalAssistantInput = z.infer<typeof legalAssistantInputSchema>;

const SYSTEM_PROMPT = [
  "أنت مساعد بحث قانوني عام باللغة العربية. لا تقدّم استشارة قانونية ملزمة أو بديلاً عن محامٍ مرخص.",
  "بيّن الولاية القضائية التي يستند إليها الجواب، وافصل بين ما ورد في المواد المرسلة وما هو استنتاج عام.",
  "لا تختلق نصوصاً أو أرقام مواد أو أحكاماً أو تواريخ نفاذ. إذا لم تكفِ المعلومات أو كان القانون قد يتغير، فصرّح بذلك ووجّه المستخدم إلى النص الرسمي المحدّث.",
  "نبّه إلى أن الإجابة آلية للبحث فقط ويجب التحقق من المصدر الرسمي قبل الاعتماد. لا تحفظ المحادثة ولا تطلب أسماء موكلين أو أسراراً مهنية.",
].join("\n");

export function buildLegalAssistantMessages(input: LegalAssistantInput) {
  const userParts = [`سؤال البحث:\n${input.question}`];
  if (input.excerpts.length > 0) {
    userParts.push(`مواد قانونية اختار المستخدم إرسالها:\n${input.excerpts.map((excerpt, index) => `--- المادة المختارة ${index + 1} ---\n${excerpt}`).join("\n")}`);
  }

  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: userParts.join("\n\n") },
  ];
}
