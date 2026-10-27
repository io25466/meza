import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, decryptBackupJson, encryptBackupJson } from "./backup-crypto";

describe("encrypted portable backup format", () => {
  it("round-trips arbitrary bytes through base64", () => {
    for (const bytes of [new Uint8Array([0]), new Uint8Array([0, 1]), new Uint8Array([0, 1, 2]), new Uint8Array([255, 254, 253, 252, 251])]) {
      expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
    }
  });

  it("encrypts and authenticates a backup with an independent recovery phrase", async () => {
    const plain = JSON.stringify({ clients: [{ id: "client-1", name: "اسم خاص" }], exportedAt: "2026-10-19T12:00:00Z" });
    const archive = await encryptBackupJson(plain, "backup phrase with 24 chars", new Uint8Array(16).fill(3), new Uint8Array(12).fill(7));
    expect(await decryptBackupJson(archive, "backup phrase with 24 chars")).toBe(plain);
    await expect(decryptBackupJson(archive, "incorrect recovery phrase")).rejects.toThrow("تعذر فك النسخة");
  });

  it("rejects unsupported rounds and tampered ciphertext", async () => {
    const archive = await encryptBackupJson("{}", "backup phrase with 24 chars", new Uint8Array(16).fill(5), new Uint8Array(12).fill(8));
    const parsed = JSON.parse(archive) as Record<string, unknown>;
    parsed.rounds = 1;
    await expect(decryptBackupJson(JSON.stringify(parsed), "backup phrase with 24 chars")).rejects.toThrow("غير مدعوم");
    parsed.rounds = 300_000;
    const cipher = String(parsed.ciphertext);
    parsed.ciphertext = `${cipher.slice(0, -4)}AAAA`;
    await expect(decryptBackupJson(JSON.stringify(parsed), "backup phrase with 24 chars")).rejects.toThrow("تعذر فك النسخة");
  });

  it("requires a recovery phrase of at least twelve characters", async () => {
    await expect(encryptBackupJson("{}", "short", new Uint8Array(16), new Uint8Array(12))).rejects.toThrow("12 محرفاً");
  });
});
