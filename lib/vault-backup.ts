import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import type { AppData, TrashItem, VaultFile } from "./models";
import { normalizeAppData } from "./models";
import { bytesToBase64, decryptBackupJson, encryptBackupJson } from "./backup-crypto";
import { decryptAttachment, deleteEncryptedAttachment, encryptAttachment } from "./secure-vault";

const BACKUP_PAYLOAD_FORMAT = "MIZAN-DATA-PAYLOAD";
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 5_000;

type AttachmentExport = { id: string; base64: string };
type BackupPayload = {
  format: typeof BACKUP_PAYLOAD_FORMAT;
  schemaVersion: 1;
  exportedAt: string;
  data: AppData;
  attachments: AttachmentExport[];
};

type RawBackupPayload = {
  format?: unknown;
  schemaVersion?: unknown;
  exportedAt?: unknown;
  data?: unknown;
  attachments?: unknown;
};

function referencedFiles(data: AppData, requireEncryptedPath = true): VaultFile[] {
  const byId = new Map<string, VaultFile>();
  const all = [...data.files, ...data.trash.flatMap((item) => item.snapshot.files ?? [])];
  for (const file of all) {
    if (!file.id || (requireEncryptedPath && !file.encryptedFile)) throw new Error("تتضمن الخزنة ملفاً ناقصاً؛ لم تُنشأ نسخة جزئية.");
    const prior = byId.get(file.id);
    if (prior && prior.encryptedFile !== file.encryptedFile) throw new Error("تعارض معرّف ملف في الخزنة؛ أوقفنا النسخ لحماية المستندات.");
    byId.set(file.id, file);
  }
  return [...byId.values()];
}

function stripDevicePaths(data: AppData): AppData {
  const strip = (file: VaultFile): VaultFile => ({ ...file, encryptedFile: "" });
  const trash: TrashItem[] = data.trash.map((item) => ({
    ...item,
    snapshot: {
      ...item.snapshot,
      files: item.snapshot.files?.map(strip),
    },
  }));
  return { ...data, files: data.files.map(strip), trash };
}

export async function createEncryptedVaultBackup(data: AppData, passphrase: string): Promise<{ archive: string; exportedAt: string }> {
  if (Platform.OS === "web") throw new Error("إنشاء نسخة احتياطية متاحة في تطبيق الهاتف فقط؛ تخزين معاينة الويب غير مشفر.");
  const files = referencedFiles(data);
  if (files.length > MAX_ATTACHMENTS) throw new Error("عدد المرفقات يتجاوز الحد المدعوم في النسخة الاحتياطية.");
  const attachments: AttachmentExport[] = [];
  for (const file of files) {
    const base64 = await decryptAttachment(file.encryptedFile);
    if (!base64 || base64.length > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 16) {
      throw new Error(`المرفق «${file.title}» مفقود أو يتجاوز الحد المدعوم؛ لم تُنشأ نسخة جزئية.`);
    }
    attachments.push({ id: file.id, base64 });
  }
  const exportedAt = new Date().toISOString();
  const payload: BackupPayload = {
    format: BACKUP_PAYLOAD_FORMAT,
    schemaVersion: 1,
    exportedAt,
    data: stripDevicePaths({ ...data, lastBackupAt: exportedAt }),
    attachments,
  };
  const salt = Crypto.getRandomBytes(16);
  const nonce = Crypto.getRandomBytes(12);
  const archive = await encryptBackupJson(JSON.stringify(payload), passphrase, salt, nonce);
  return { archive, exportedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertBackupPayload(raw: RawBackupPayload): asserts raw is Required<RawBackupPayload> {
  if (raw.format !== BACKUP_PAYLOAD_FORMAT || raw.schemaVersion !== 1 || !isRecord(raw.data) || !Array.isArray(raw.attachments)) {
    throw new Error("محتوى النسخة غير معروف أو غير مكتمل.");
  }
  if (raw.attachments.length > MAX_ATTACHMENTS) throw new Error("عدد المرفقات في النسخة أكبر من الحد المدعوم.");
  const requiredArrays = ["clients", "cases", "payments", "appointments", "powers", "files", "articles", "lawSources", "tasks", "templates", "expenses"];
  for (const key of requiredArrays) if (!Array.isArray(raw.data[key])) throw new Error("النسخة لا تحتوي على بنية سجلات مكتملة.");
  for (const key of ["financialAudit", "trash"]) if (raw.data[key] !== undefined && !Array.isArray(raw.data[key])) throw new Error("بنية السجل أو سلة المحذوفات غير صالحة.");
  for (const [name, rows] of Object.entries(raw.data)) {
    if (!Array.isArray(rows)) continue;
    if (rows.length > 100_000 || rows.some((row) => !isRecord(row) || typeof row.id !== "string")) {
      throw new Error(`سجل ${name} غير صالح أو كبير جداً.`);
    }
  }
  for (const item of raw.attachments) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.base64 !== "string") throw new Error("بيانات أحد المرفقات في النسخة غير صالحة.");
    if (item.base64.length > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 16 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.base64)) {
      throw new Error("مرفق في النسخة تالف أو أكبر من 8 ميغابايت.");
    }
  }
}

function rebindFiles(data: AppData, filesById: Map<string, VaultFile>): AppData {
  const bind = (file: VaultFile) => {
    const encrypted = filesById.get(file.id);
    if (!encrypted) throw new Error(`لم يُعثر على محتوى المرفق «${file.title}» داخل النسخة.`);
    return { ...file, encryptedFile: encrypted.encryptedFile };
  };
  return {
    ...data,
    files: data.files.map(bind),
    trash: data.trash.map((item) => ({ ...item, snapshot: { ...item.snapshot, files: item.snapshot.files?.map(bind) } })),
    appointments: data.appointments.map((appointment) => ({ ...appointment, reminders: [] })),
    tasks: data.tasks.map((task) => ({ ...task, reminderIds: [] })),
  };
}

export async function restoreEncryptedVaultBackup(archive: string, passphrase: string): Promise<{ data: AppData; exportedAt: string }> {
  if (Platform.OS === "web") throw new Error("استعادة النسخة متاحة في تطبيق الهاتف فقط.");
  const plaintext = await decryptBackupJson(archive, passphrase);
  let raw: RawBackupPayload;
  try { raw = JSON.parse(plaintext) as RawBackupPayload; }
  catch { throw new Error("تعذر قراءة محتوى النسخة بعد فك التشفير."); }
  assertBackupPayload(raw);
  const imported = normalizeAppData(raw.data);
  const exportedAttachments = raw.attachments as AttachmentExport[];
  const attachmentById = new Map(exportedAttachments.map((item) => [item.id, item.base64]));
  const fileRefs = referencedFiles(imported, false);
  if (fileRefs.length !== attachmentById.size || fileRefs.some((file) => !attachmentById.has(file.id))) {
    throw new Error("قائمة المرفقات لا تطابق سجلات الخزنة؛ لم تتغير بيانات الجهاز.");
  }

  const filesById = new Map<string, VaultFile>();
  const createdEncryptedPaths: string[] = [];
  try {
    for (const file of fileRefs) {
      const base64 = attachmentById.get(file.id);
      if (!base64) throw new Error(`محتوى المرفق «${file.title}» غير موجود.`);
      const encryptedFile = await encryptAttachment(base64, file.title);
      createdEncryptedPaths.push(encryptedFile);
      filesById.set(file.id, { ...file, encryptedFile });
    }
    return {
      data: rebindFiles(imported, filesById),
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    };
  } catch (error) {
    await Promise.all(createdEncryptedPaths.map((path) => deleteEncryptedAttachment(path)));
    throw error;
  }
}

export async function discardRestoredVaultFiles(data: AppData): Promise<void> {
  const paths = new Set([...data.files, ...data.trash.flatMap((item) => item.snapshot.files ?? [])].map((file) => file.encryptedFile).filter(Boolean));
  await Promise.all([...paths].map((path) => deleteEncryptedAttachment(path)));
}

export function backupFileName(date = new Date()): string {
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `mizan-backup-${stamp}.mizanbackup`;
}

export function binaryArchiveToBase64(archive: string): string {
  return bytesToBase64(new TextEncoder().encode(archive));
}
