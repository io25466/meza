import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

export const BACKUP_FORMAT = "MIZAN-ENCRYPTED-BACKUP";
export const BACKUP_VERSION = 1;
export const BACKUP_KDF_ROUNDS = 300_000;
const MAX_ARCHIVE_CHARS = 140_000_000;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let part = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] ?? 0 : 0;
    const c = hasC ? bytes[i + 2] ?? 0 : 0;
    part += BASE64[a >> 2]
      + BASE64[((a & 3) << 4) | (b >> 4)]
      + (hasB ? BASE64[((b & 15) << 2) | (c >> 6)] : "=")
      + (hasC ? BASE64[c & 63] : "=");
    if (part.length >= 16_384) {
      chunks.push(part);
      part = "";
    }
  }
  if (part) chunks.push(part);
  return chunks.join("");
}

export function base64ToBytes(value: string): Uint8Array {
  if (!value || value.length % 4 !== 0 || value.length > MAX_ARCHIVE_CHARS) {
    throw new Error("ملف النسخة الاحتياطية غير صالح أو أكبر من الحد المدعوم.");
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((value.length / 4) * 3 - padding);
  let offset = 0;
  for (let i = 0; i < value.length; i += 4) {
    const c0 = BASE64.indexOf(value[i] ?? "");
    const c1 = BASE64.indexOf(value[i + 1] ?? "");
    const char2 = value[i + 2] ?? "";
    const char3 = value[i + 3] ?? "";
    const c2 = char2 === "=" ? 0 : BASE64.indexOf(char2);
    const c3 = char3 === "=" ? 0 : BASE64.indexOf(char3);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0 || (char2 === "=" && char3 !== "=")) {
      throw new Error("ملف النسخة الاحتياطية يحتوي ترميزاً غير صالح.");
    }
    if (offset < output.length) output[offset++] = (c0 << 2) | (c1 >> 4);
    if (offset < output.length) output[offset++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (offset < output.length) output[offset++] = ((c2 & 3) << 6) | c3;
  }
  return output;
}

function validatePassphrase(passphrase: string): void {
  if (passphrase.trim().length < 12) throw new Error("عبارة الاستعادة يجب أن تتكون من 12 محرفاً على الأقل.");
}

export async function encryptBackupJson(
  json: string,
  passphrase: string,
  salt: Uint8Array,
  nonce: Uint8Array,
): Promise<string> {
  validatePassphrase(passphrase);
  if (salt.length !== 16 || nonce.length !== 12) throw new Error("معاملات تشفير غير صالحة.");
  const plain = utf8ToBytes(json);
  if (plain.length > 100_000_000) throw new Error("حجم النسخة الاحتياطية يتجاوز 100 ميغابايت.");
  const key = await pbkdf2Async(sha256, utf8ToBytes(passphrase), salt, { c: BACKUP_KDF_ROUNDS, dkLen: 32 });
  try {
    const ciphertext = gcm(key, nonce, utf8ToBytes(`${BACKUP_FORMAT}:${BACKUP_VERSION}`)).encrypt(plain);
    return JSON.stringify({
      magic: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      cipher: "AES-256-GCM",
      kdf: "PBKDF2-SHA256",
      rounds: BACKUP_KDF_ROUNDS,
      salt: bytesToBase64(salt),
      nonce: bytesToBase64(nonce),
      ciphertext: bytesToBase64(ciphertext),
    });
  } finally {
    plain.fill(0);
    key.fill(0);
  }
}

export async function decryptBackupJson(archive: string, passphrase: string): Promise<string> {
  validatePassphrase(passphrase);
  if (archive.length > MAX_ARCHIVE_CHARS) throw new Error("حجم ملف النسخة يتجاوز الحد المدعوم.");
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(archive) as Record<string, unknown>;
  } catch {
    throw new Error("الملف ليس نسخة احتياطية صالحة من ميزان.");
  }
  if (
    envelope.magic !== BACKUP_FORMAT
    || envelope.version !== BACKUP_VERSION
    || envelope.cipher !== "AES-256-GCM"
    || envelope.kdf !== "PBKDF2-SHA256"
    || envelope.rounds !== BACKUP_KDF_ROUNDS
    || typeof envelope.salt !== "string"
    || typeof envelope.nonce !== "string"
    || typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("إصدار ملف النسخة غير مدعوم أو بياناته غير مكتملة.");
  }
  const salt = base64ToBytes(envelope.salt);
  const nonce = base64ToBytes(envelope.nonce);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (salt.length !== 16 || nonce.length !== 12 || ciphertext.length < 16 || ciphertext.length > 100_000_016) {
    throw new Error("ملف النسخة الاحتياطية غير صالح.");
  }
  const key = await pbkdf2Async(sha256, utf8ToBytes(passphrase), salt, { c: BACKUP_KDF_ROUNDS, dkLen: 32 });
  try {
    const plain = gcm(key, nonce, utf8ToBytes(`${BACKUP_FORMAT}:${BACKUP_VERSION}`)).decrypt(ciphertext);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(plain); }
    finally { plain.fill(0); }
  } catch {
    throw new Error("تعذر فك النسخة. تحقق من عبارة الاستعادة أو من سلامة الملف.");
  } finally {
    key.fill(0);
  }
}
