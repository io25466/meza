import { strFromU8, unzipSync } from "fflate";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const output = new Uint8Array(Math.floor(clean.length * 3 / 4) - padding);
  let out = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const a = BASE64.indexOf(clean[index] ?? "A");
    const b = BASE64.indexOf(clean[index + 1] ?? "A");
    const c = BASE64.indexOf(clean[index + 2] ?? "A");
    const d = BASE64.indexOf(clean[index + 3] ?? "A");
    const bits = ((Math.max(0, a) << 18) | (Math.max(0, b) << 12) | (Math.max(0, c) << 6) | Math.max(0, d));
    if (out < output.length) output[out++] = (bits >> 16) & 255;
    if (out < output.length) output[out++] = (bits >> 8) & 255;
    if (out < output.length) output[out++] = bits & 255;
  }
  return output;
}

function unescapeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function extractDocxText(base64: string): string {
  const archive = unzipSync(base64ToBytes(base64));
  const document = archive["word/document.xml"];
  if (!document) return "";
  const xml = strFromU8(document);
  return unescapeXml(xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\r\f]+/g, " ")
    .replace(/ *\n */g, "\n")
  ).trim();
}
