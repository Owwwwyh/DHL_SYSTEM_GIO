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

/**
 * Persist an uploaded binary so it survives across requests / serverless
 * invocations. Returns a public URL (or local relative path in dev fallback).
 *
 * Uses Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production / preview).
 * Falls back to writing to public/uploads/ for local dev so contributors
 * don't need a Blob token to run the app.
 */
export async function uploadBinary(
  buffer: Buffer,
  filename: string,
  contentType?: string
): Promise<string> {
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`uploads/${safeName}`, buffer, {
      access: "public",
      contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  // Dev fallback — local filesystem under public/uploads/
  const { writeFileSync, mkdirSync } = await import("fs");
  const path = await import("path");
  mkdirSync("public/uploads", { recursive: true });
  const localPath = path.join("public/uploads", safeName);
  writeFileSync(localPath, buffer);
  return localPath;
}

/**
 * Read a previously-uploaded binary back into memory. Handles both Blob URLs
 * (https://...) and local relative paths (public/uploads/...).
 * Used by the processing pipeline when it needs the raw bytes (e.g. Gemini
 * vision) for a file that was uploaded in an earlier request.
 */
export async function readBinary(urlOrPath: string): Promise<Buffer> {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`Failed to fetch ${urlOrPath}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const { readFileSync } = await import("fs");
  return readFileSync(urlOrPath);
}
