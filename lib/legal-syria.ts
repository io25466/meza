export const SYRIA_LEGAL_SOURCES = [
  { title: "وزارة العدل السورية", url: "https://moj.gov.sy/", role: "قرارات ومعلومات قضائية" },
  { title: "وزارة الاتصالات السورية — قانون حماية البيانات رقم 12 لعام 2024", url: "https://moct.gov.sy/laws/%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%AD%D9%85%D8%A7%D9%8A%D8%A9-%D8%A7%D9%84%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA-%D8%A7%D9%84%D8%B4%D8%AE%D8%B5%D9%8A%D8%A9-%D8%B1%D9%82%D9%85-12-%D9%84%D8%B9%D8%A7%D9%85-2024", role: "مصدر تشريعي" },
  { title: "وزارة الاتصالات السورية — التعليمات التنفيذية", url: "https://moct.gov.sy/laws/law2", role: "موجز رسمي للتعليمات" },
  { title: "المصرف المركزي السوري", url: "https://cb.gov.sy/", role: "مصدر نقدي رسمي؛ لا يحول ميزان الأرقام تلقائياً" },
] as const;

/** Non-exclusive editable hints; verify current court names and competence before relying on them. */
export const SYRIA_COURT_LEVEL_SUGGESTIONS = ["صلح", "بداية", "استئناف", "نقض", "أحوال شخصية", "أحداث", "أخرى"] as const;
export const SYRIA_GOVERNORATE_SUGGESTIONS = ["دمشق", "ريف دمشق", "حلب", "حمص", "حماة", "اللاذقية", "طرطوس", "إدلب", "دير الزور", "الرقة", "الحسكة", "درعا", "السويداء", "القنيطرة"] as const;

export const SYRIA_NOTICE = "اقتراحات إدخال قابلة للتحرير وليست قائمة رسمية حصرية. لا يحسب ميزان مهل الطعن أو الاختصاص القضائي تلقائياً؛ راجع المصدر السوري الرسمي والمحامي المختص.";

export function isOfficialSyriaSource(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "moj.gov.sy" || host.endsWith(".moj.gov.sy") || host === "moct.gov.sy" || host.endsWith(".moct.gov.sy") || host === "cb.gov.sy" || host.endsWith(".cb.gov.sy");
  } catch { return false; }
}
