export function lawyerGreeting(name: string | undefined, now: Date = new Date()): string {
  const normalizedName = name?.trim();
  if (!normalizedName) return "مرحباً بك، سيادة المستشار";
  const address = `الأستاذ ${normalizedName}`;
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return `أسعد الله صباحك، ${address}`;
  if (hour >= 12 && hour < 18) return `مرحباً بك، ${address}`;
  return `أسعد الله مساءك، ${address}`;
}
