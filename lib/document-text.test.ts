import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractDocxText } from "./document-text";

describe("local DOCX text extraction", () => {
  it("extracts Arabic paragraphs from the document XML without a server", () => {
    const documentXml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>المادة الأولى</w:t></w:r></w:p><w:p><w:r><w:t>يلتزم الطرفان بحسن النية.</w:t></w:r></w:p></w:body></w:document>';
    const docx = zipSync({ "word/document.xml": strToU8(documentXml) });
    const extracted = extractDocxText(Buffer.from(docx).toString("base64"));
    expect(extracted).toContain("المادة الأولى");
    expect(extracted).toContain("يلتزم الطرفان بحسن النية.");
  });
});
