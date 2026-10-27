export type PaymentStatus = "unpaid" | "partial" | "paid";
export type AgencyType = "general" | "special" | "sharia";
export type TaskStatus = "pending" | "in_progress" | "done";
export type TaskPhase = "hearing_preparation" | "service_followup" | "pleading_preparation" | "other";

export type Client = {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
};

export type LegalCase = {
  id: string;
  clientId: string;
  title: string;
  type: string;
  status: string;
  court?: string;
  courtLevel?: string;
  governorate?: string;
  caseNumber?: string;
  totalFees: number;
  advancePayment: number;
  advancePaymentDate?: string;
  createdAt: string;
};

export type PaymentMethod = "cash" | "bank_transfer" | "card" | "other";
export type Payment = {
  id: string;
  caseId: string;
  amount: number;
  date: string;
  kind: "advance" | "installment";
  method?: PaymentMethod;
  note?: string;
};

export type AppointmentStatus = "scheduled" | "completed" | "postponed" | "cancelled";

export type Appointment = {
  id: string;
  caseId?: string;
  title: string;
  kind: "hearing" | "meeting";
  date: string;
  time: string;
  durationMinutes?: number;
  location?: string;
  status?: AppointmentStatus;
  sessionNotes?: string;
  decision?: string;
  reminders: string[];
};

export type PowerOfAttorney = {
  id: string;
  clientId: string;
  number: string;
  date: string;
  capacity: string;
  agencyType?: AgencyType;
  fileId?: string;
};

export type VaultFile = {
  id: string;
  title: string;
  mimeType: string;
  encryptedFile: string;
  createdAt: string;
  clientId?: string;
  caseId?: string;
};

export type LawArticle = {
  id: string;
  title: string;
  number: string;
  specialty: string;
  text: string;
  favorite: boolean;
  sourceId?: string;
  lawNumber?: string;
  lawYear?: string;
  sourceUrl?: string;
  effectiveDate?: string;
  verifiedAt?: string;
  createdAt: string;
};

export type LawSource = {
  id: string;
  title: string;
  specialty: string;
  fileId: string;
  fileName: string;
  lawNumber?: string;
  lawYear?: string;
  sourceUrl?: string;
  effectiveDate?: string;
  verifiedAt?: string;
  createdAt: string;
};

export type OfficeTask = {
  id: string;
  caseId?: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  phase?: TaskPhase;
  reminderIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type DocumentTemplateVersion = {
  id: string;
  title?: string;
  body: string;
  savedAt: string;
};

export type DocumentTemplate = {
  id: string;
  title: string;
  body: string;
  versions: DocumentTemplateVersion[];
  createdAt: string;
  updatedAt: string;
};

export type OfficeExpense = {
  id: string;
  amount: number;
  date: string;
  category: string;
  note?: string;
  clientId?: string;
  caseId?: string;
  createdAt: string;
};

export type FinancialAuditAction = "created" | "corrected" | "voided" | "restored";
export type FinancialAuditKind = "payment" | "expense" | "advance";
export type FinancialAuditSnapshot = {
  amount: number;
  date: string;
  paymentKind?: "advance" | "installment";
  caseId?: string;
  clientId?: string;
  method?: PaymentMethod;
  note?: string;
  category?: string;
};

export type FinancialAuditEntry = {
  id: string;
  recordId: string;
  kind: FinancialAuditKind;
  action: FinancialAuditAction;
  caseId?: string;
  clientId?: string;
  before?: FinancialAuditSnapshot;
  after?: FinancialAuditSnapshot;
  reason?: string;
  createdAt: string;
};

export type TrashKind = "client" | "case" | "appointment" | "power" | "payment" | "expense" | "task" | "template" | "article" | "lawSource";
export type TrashSnapshot = {
  clients?: Client[];
  cases?: LegalCase[];
  payments?: Payment[];
  appointments?: Appointment[];
  powers?: PowerOfAttorney[];
  files?: VaultFile[];
  tasks?: OfficeTask[];
  templates?: DocumentTemplate[];
  articles?: LawArticle[];
  lawSources?: LawSource[];
  expenses?: OfficeExpense[];
  financialAudit?: FinancialAuditEntry[];
};

export type TrashItem = {
  id: string;
  kind: TrashKind;
  title: string;
  deletedAt: string;
  snapshot: TrashSnapshot;
};

export type AppData = {
  clients: Client[];
  cases: LegalCase[];
  payments: Payment[];
  appointments: Appointment[];
  powers: PowerOfAttorney[];
  files: VaultFile[];
  articles: LawArticle[];
  lawSources: LawSource[];
  tasks: OfficeTask[];
  templates: DocumentTemplate[];
  expenses: OfficeExpense[];
  financialAudit: FinancialAuditEntry[];
  trash: TrashItem[];
  currency: string;
  lastBackupAt?: string;
  orphanReminderIds?: string[];
  jurisdiction: "SY" | "other";
  reminder24hEnabled?: boolean;
  reminder1hEnabled?: boolean;
  lawyerName?: string;
};

export const EMPTY_DATA: AppData = {
  clients: [],
  cases: [],
  payments: [],
  appointments: [],
  powers: [],
  files: [],
  articles: [],
  lawSources: [],
  tasks: [],
  templates: [],
  expenses: [],
  financialAudit: [],
    trash: [],
  currency: "ل.س (جديدة)",
  lastBackupAt: undefined,
  orphanReminderIds: [],
  jurisdiction: "SY",
  lawyerName: "",
};

/** Keep old encrypted vaults readable; new collections start empty and jurisdiction defaults to Syria. */
export function normalizeAppData(raw: unknown): AppData {
  const value = raw && typeof raw === "object" ? raw as Partial<AppData> : {};
  return {
    ...EMPTY_DATA,
    ...value,
    clients: Array.isArray(value.clients) ? value.clients : [],
    cases: Array.isArray(value.cases) ? value.cases : [],
    payments: Array.isArray(value.payments) ? value.payments : [],
    appointments: Array.isArray(value.appointments) ? value.appointments : [],
    powers: Array.isArray(value.powers) ? value.powers : [],
    files: Array.isArray(value.files) ? value.files : [],
    articles: Array.isArray(value.articles) ? value.articles : [],
    lawSources: Array.isArray(value.lawSources) ? value.lawSources : [],
    tasks: Array.isArray(value.tasks) ? value.tasks : [],
    templates: Array.isArray(value.templates) ? value.templates : [],
    expenses: Array.isArray(value.expenses) ? value.expenses : [],
    financialAudit: Array.isArray(value.financialAudit) ? value.financialAudit : [],
    trash: Array.isArray(value.trash) ? value.trash : [],
    currency: typeof value.currency === "string" ? value.currency : EMPTY_DATA.currency,
    lastBackupAt: typeof value.lastBackupAt === "string" ? value.lastBackupAt : undefined,
    orphanReminderIds: Array.isArray(value.orphanReminderIds) ? value.orphanReminderIds.filter((id): id is string => typeof id === "string") : [],
    jurisdiction: value.jurisdiction === "other" ? "other" : "SY",
    lawyerName: typeof value.lawyerName === "string" ? value.lawyerName.slice(0, 60) : "",
  };
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function totalPaid(legalCase: LegalCase, payments: Payment[]): number {
  const casePayments = payments.filter((payment) => payment.caseId === legalCase.id);
  const recordedAdvance = casePayments.filter((payment) => payment.kind === "advance").reduce((sum, payment) => sum + payment.amount, 0);
  const advance = casePayments.some((payment) => payment.kind === "advance") ? recordedAdvance : legalCase.advancePayment;
  const installments = casePayments.filter((payment) => payment.kind === "installment").reduce((sum, payment) => sum + payment.amount, 0);
  return Math.min(legalCase.totalFees, advance + installments);
}

export function remainingBalance(legalCase: LegalCase, payments: Payment[]): number {
  return Math.max(0, legalCase.totalFees - totalPaid(legalCase, payments));
}

export function paymentStatus(legalCase: LegalCase, payments: Payment[]): PaymentStatus {
  if (remainingBalance(legalCase, payments) === 0) return "paid";
  return totalPaid(legalCase, payments) > 0 ? "partial" : "unpaid";
}

export function totalReceivables(data: AppData): number {
  return data.cases.reduce((sum, legalCase) => sum + remainingBalance(legalCase, data.payments), 0);
}

export function normalizeArabic(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .toLowerCase()
    .trim();
}
