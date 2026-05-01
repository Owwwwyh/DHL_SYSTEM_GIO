import crypto from "crypto";

export function computeHash(content: string): string {
  return crypto.createHash("md5").update(content).digest("hex");
}

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return data.text.trim();
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export async function extractTextFromFile(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; hash: string }> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  let text = "";

  if (ext === "pdf") {
    text = await extractPdfText(buffer);
  } else if (ext === "docx" || ext === "doc") {
    text = await extractDocxText(buffer);
  } else {
    text = buffer.toString("utf-8");
  }

  const hash = computeFileHash(buffer);
  return { text, hash };
}
