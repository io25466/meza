import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppData } from "./models";
import { EMPTY_DATA, normalizeAppData } from "./models";

const KEY_ITEM = "mizan.vault.key.v1";
const PIN_ITEM = "mizan.vault.pin.v1";
const BIOMETRIC_ITEM = "mizan.vault.biometric.v1";
const APP_LOCK_ITEM = "mizan.vault.lock-enabled.v1";
let cachedPinRecord: string | null | undefined;
const DATA_FILE = `${FileSystem.documentDirectory ?? ""}mizan-data-v1.enc`;
const DATA_FILE_TEMP = `${DATA_FILE}.tmp`;
const DATA_FILE_PREVIOUS = `${DATA_FILE}.previous`;
const WEB_DATA_ITEM = "mizan.preview.data.v1";
const PBKDF2_ROUNDS = 180_000;

function encodeEnvelope(key: Uint8Array, plaintext: string): string {
  const nonce = Crypto.getRandomBytes(12);
  const ciphertext = gcm(key, nonce).encrypt(utf8ToBytes(plaintext));
  return JSON.stringify({ version: 1, nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext) });
}

function decodeEnvelope(key: Uint8Array, envelope: string): string {
  const parsed = JSON.parse(envelope) as { version?: number; nonce?: string; ciphertext?: string };
  if (parsed.version !== 1 || !parsed.nonce || !parsed.ciphertext) throw new Error("الملف المشفر غير صالح");
  const plaintext = gcm(key, hexToBytes(parsed.nonce)).decrypt(hexToBytes(parsed.ciphertext));
  return new TextDecoder("utf-8").decode(plaintext);
}

async function derivePin(pin: string, salt: Uint8Array): Promise<string> {
  if (Platform.OS === "android") {
    try {
      const { default: nativeModule } = await import("expo-mizan-home-widget");
      return await nativeModule.derivePinHash(pin, bytesToHex(salt), PBKDF2_ROUNDS);
    } catch {
      // Expo Go and platforms without the local native module use the same-strength JS implementation.
    }
  }
  return bytesToHex(await pbkdf2Async(sha256, utf8ToBytes(pin), salt, { c: PBKDF2_ROUNDS, dkLen: 32 }));
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function getPinRecord(): Promise<string | null> {
  if (cachedPinRecord !== undefined) return cachedPinRecord;
  cachedPinRecord = await SecureStore.getItemAsync(PIN_ITEM);
  return cachedPinRecord;
}

export async function hasVaultPin(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  return (await getPinRecord()) !== null;
}

export async function getAppLockPreference(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  return (await SecureStore.getItemAsync(APP_LOCK_ITEM)) !== "false";
}

export async function setAppLockPreference(enabled: boolean): Promise<void> {
  if (Platform.OS === "web") throw new Error("قفل التطبيق متاح في نسخة الهاتف فقط");
  await SecureStore.setItemAsync(APP_LOCK_ITEM, enabled ? "true" : "false");
}

export async function createVaultPin(pin: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem("mizan.preview.pin.v1", pin);
    return;
  }
  if (!/^\d{6}$/.test(pin)) throw new Error("اختر رمزاً من 6 أرقام");
  const salt = Crypto.getRandomBytes(16);
  const key = Crypto.getRandomBytes(32);
  const pinHash = await derivePin(pin, salt);
  const pinRecord = `${bytesToHex(salt)}:${pinHash}`;
  await SecureStore.setItemAsync(PIN_ITEM, pinRecord);
  cachedPinRecord = pinRecord;
  await SecureStore.setItemAsync(KEY_ITEM, bytesToHex(key));
  if (FileSystem.documentDirectory && !(await FileSystem.getInfoAsync(DATA_FILE)).exists) {
    await writeVault(EMPTY_DATA);
  }
}

export async function verifyVaultPin(pin: string): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const stored = await getPinRecord();
  if (!stored) return false;
  const [saltHex, expectedHash] = stored.split(":");
  if (!saltHex || !expectedHash) return false;
  return constantTimeHexEqual(await derivePin(pin, hexToBytes(saltHex)), expectedHash);
}

export async function changeVaultPin(currentPin: string, nextPin: string): Promise<void> {
  if (Platform.OS === "web") throw new Error("تغيير رمز الخزنة متاح في تطبيق الهاتف فقط");
  if (!/^\d{6}$/.test(nextPin)) throw new Error("يجب أن يتكون الرمز الجديد من 6 أرقام");
  if (!(await verifyVaultPin(currentPin))) throw new Error("رمز الدخول الحالي غير صحيح");
  const salt = Crypto.getRandomBytes(16);
  const hash = await derivePin(nextPin, salt);
  const pinRecord = `${bytesToHex(salt)}:${hash}`;
  await SecureStore.setItemAsync(PIN_ITEM, pinRecord);
  cachedPinRecord = pinRecord;
}

export async function getBiometricPreference(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return (await SecureStore.getItemAsync(BIOMETRIC_ITEM)) !== "false";
}

export async function setBiometricPreference(enabled: boolean): Promise<void> {
  if (Platform.OS === "web") throw new Error("البصمة متاحة في تطبيق الهاتف فقط");
  await SecureStore.setItemAsync(BIOMETRIC_ITEM, enabled ? "true" : "false");
}

async function nativeKey(): Promise<Uint8Array> {
  const encoded = await SecureStore.getItemAsync(KEY_ITEM);
  if (!encoded) throw new Error("تعذر العثور على مفتاح الخزنة");
  return hexToBytes(encoded);
}

export async function readVault(): Promise<AppData> {
  if (Platform.OS === "web") {
    const stored = await AsyncStorage.getItem(WEB_DATA_ITEM);
    return stored ? normalizeAppData(JSON.parse(stored)) : EMPTY_DATA;
  }
  if (!FileSystem.documentDirectory) return EMPTY_DATA;
  const key = await nativeKey();
  let primaryError: unknown;
  for (const path of [DATA_FILE, DATA_FILE_PREVIOUS]) {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) continue;
    try {
      const decoded = decodeEnvelope(key, await FileSystem.readAsStringAsync(path));
      const normalized = normalizeAppData(JSON.parse(decoded));
      if (path === DATA_FILE_PREVIOUS) {
        await FileSystem.deleteAsync(DATA_FILE, { idempotent: true }).catch(() => undefined);
        await FileSystem.moveAsync({ from: DATA_FILE_PREVIOUS, to: DATA_FILE });
      }
      return normalized;
    } catch (error) {
      if (path === DATA_FILE_PREVIOUS) throw error;
      primaryError = error;
    }
  }
  if (primaryError) throw new Error("تعذر فتح ملف الخزنة أو استعادته؛ لم نعرض بيانات فارغة كيلا تُستبدل سجلاتك.");
  return EMPTY_DATA;
}

export async function writeVault(data: AppData): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(WEB_DATA_ITEM, JSON.stringify(data));
    return;
  }
  if (!FileSystem.documentDirectory) throw new Error("مساحة تخزين الجهاز غير متاحة");
  const envelope = encodeEnvelope(await nativeKey(), JSON.stringify(data));
  await FileSystem.deleteAsync(DATA_FILE_TEMP, { idempotent: true }).catch(() => undefined);
  await FileSystem.writeAsStringAsync(DATA_FILE_TEMP, envelope);
  const existing = await FileSystem.getInfoAsync(DATA_FILE);
  if (existing.exists) {
    await FileSystem.deleteAsync(DATA_FILE_PREVIOUS, { idempotent: true }).catch(() => undefined);
    await FileSystem.moveAsync({ from: DATA_FILE, to: DATA_FILE_PREVIOUS });
  }
  try {
    await FileSystem.moveAsync({ from: DATA_FILE_TEMP, to: DATA_FILE });
  } catch (error) {
    const previous = await FileSystem.getInfoAsync(DATA_FILE_PREVIOUS);
    if (previous.exists && !(await FileSystem.getInfoAsync(DATA_FILE)).exists) {
      await FileSystem.moveAsync({ from: DATA_FILE_PREVIOUS, to: DATA_FILE }).catch(() => undefined);
    }
    throw error;
  }
  await FileSystem.deleteAsync(DATA_FILE_PREVIOUS, { idempotent: true }).catch(() => undefined);
}


export async function deleteTemporaryCacheFile(uri: string): Promise<void> {
  const cache = FileSystem.cacheDirectory;
  if (cache && uri.startsWith(cache)) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

export async function encryptAttachment(base64: string, fileName: string): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "document";
  const uniqueId = bytesToHex(Crypto.getRandomBytes(12));
  if (Platform.OS === "web") {
    const id = `mizan-preview-file-${uniqueId}`;
    await AsyncStorage.setItem(id, base64);
    return id;
  }
  const directory = FileSystem.documentDirectory;
  if (!directory) throw new Error("مساحة تخزين الجهاز غير متاحة");
  const path = `${directory}${Date.now()}-${uniqueId}-${safeName}.enc`;
  try {
    await FileSystem.writeAsStringAsync(path, encodeEnvelope(await nativeKey(), base64));
    return path;
  } catch (error) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

export async function deleteEncryptedAttachment(encryptedFile: string): Promise<void> {
  if (Platform.OS === "web") {
    if (encryptedFile.startsWith("mizan-preview-file-")) await AsyncStorage.removeItem(encryptedFile).catch(() => undefined);
    return;
  }
  const directory = FileSystem.documentDirectory;
  if (directory && encryptedFile.startsWith(directory)) {
    await FileSystem.deleteAsync(encryptedFile, { idempotent: true }).catch(() => undefined);
  }
}

export async function decryptAttachment(encryptedFile: string): Promise<string> {
  if (Platform.OS === "web") return (await AsyncStorage.getItem(encryptedFile)) ?? "";
  const content = await FileSystem.readAsStringAsync(encryptedFile);
  return decodeEnvelope(await nativeKey(), content);
}
