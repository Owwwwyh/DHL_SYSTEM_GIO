import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeHash, computeFileHash, extractTextFromFile, uploadBinary } from "@/lib/fileParser";
import { rateLimit } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
// Vercel serverless functions cap request body at 4.5 MB. Reject earlier with
// a clear 413 instead of letting the platform 500.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export const maxDuration = 60;

const log = logger("api/ingest");

async function checkDuplicate(hash: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - FOURTEEN_DAYS_MS);
  const existing = await prisma.rawInput.findFirst({
    where: { fileHash: hash, createdAt: { gte: cutoff } },
  });
  return !!existing;
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { scope: "ingest", capacity: 30, refillPerSec: 0.5 });
  if (limited) return limited;

  const apiKey = req.headers.get("x-api-key");
  const isUiPath = apiKey === process.env.UIPATH_API_KEY;

  if (!isUiPath) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = parseInt(req.headers.get("content-length") ?? "0");
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: `Request body too large. Max ${MAX_BODY_BYTES} bytes; got ${contentLength}.` },
      { status: 413 }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";

  let type: string = "note";
  let content: string = "";
  let filePath: string | undefined;
  let fileHash: string | undefined;
  let userId: string | undefined;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      type = (form.get("type") as string) ?? "note";
      content = (form.get("content") as string) ?? "";
      userId = (form.get("userId") as string) ?? undefined;

      const file = form.get("file") as File | null;
      if (file) {
        if (file.size > MAX_BODY_BYTES) {
          return NextResponse.json(
            { error: `File too large. Max ${MAX_BODY_BYTES} bytes; got ${file.size}.` },
            { status: 413 }
          );
        }
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (ext === "pdf" || ext === "docx" || ext === "doc") {
          const extracted = await extractTextFromFile(buffer, file.name);
          content = extracted.text;
          fileHash = extracted.hash;
          type = ext === "pdf" ? "pdf" : "docx";
        } else {
          fileHash = computeFileHash(buffer);
          filePath = await uploadBinary(buffer, file.name, file.type || undefined);
        }
      }

      if (!fileHash && content) {
        fileHash = computeHash(content);
      }
    } else {
      const body = await req.json();
      type = body.type ?? "note";
      content = body.content ?? "";
      userId = body.userId;
      fileHash = body.fileHash ?? (content ? computeHash(content) : undefined);
    }
  } catch (err) {
    log.error("failed to parse request body", { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (fileHash) {
    const isDuplicate = await checkDuplicate(fileHash);
    if (isDuplicate) {
      return NextResponse.json({
        isDuplicate: true,
        message: "Content already ingested within the last 14 days.",
      }, { status: 200 });
    }
  }

  if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });

  // Defensive: drop stale userId values that no longer exist (e.g. after a DB reseed)
  let safeUserId: string | undefined;
  if (userId) {
    const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    safeUserId = exists?.id;
  }

  const raw = await prisma.rawInput.create({
    data: {
      type,
      content,
      filePath,
      fileHash,
      source: isUiPath ? "uipath" : "web",
      userId: safeUserId,
    },
  });

  log.info("raw input created", { id: raw.id, type: raw.type, source: raw.source });
  return NextResponse.json({ id: raw.id, status: raw.status, isDuplicate: false });
}

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== process.env.UIPATH_API_KEY) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  const inputs = await prisma.rawInput.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(inputs);
}
