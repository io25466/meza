export type AppointmentKind = "hearing" | "meeting";

export function appointmentReminderMessage(kind: AppointmentKind, offset: number): { title: string; body: string } {
  const label = offset === 24 * 60 * 60 * 1000 ? "بعد 24 ساعة" : "بعد ساعة";
  return {
    title: "تذكير ميزان",
    body: `${kind === "hearing" ? "لديك جلسة قانونية" : "لديك اجتماع"} ${label}`,
  };
}
