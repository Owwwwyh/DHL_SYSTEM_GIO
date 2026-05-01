import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { computeHash, computeFileHash, extractTextFromFile } from "@/lib/fileParser";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

async function checkDuplicate(hash: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - FOURTEEN_DAYS_MS);
  const existing = await prisma.rawInput.findFirst({
    where: { fileHash: hash, createdAt: { gte: cutoff } },
  });
  return !!existing;
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const isUiPath = apiKey === process.env.UIPATH_API_KEY;

  if (!isUiPath) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  let type: string = "note";
  let content: string = "";
  let filePath: string | undefined;
  let fileHash: string | undefined;
  let userId: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    type = (form.get("type") as string) ?? "note";
    content = (form.get("content") as string) ?? "";
    userId = (form.get("userId") as string) ?? undefined;

    const file = form.get("file") as File | null;
    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // For PDF/DOCX, extract text
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "pdf" || ext === "docx" || ext === "doc") {
        const extracted = await extractTextFromFile(buffer, file.name);
        content = extracted.text;
        fileHash = extracted.hash;
        type = ext === "pdf" ? "pdf" : "docx";
      } else {
        fileHash = computeFileHash(buffer);
        // Save image file
        mkdirSync("public/uploads", { recursive: true });
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        filePath = path.join("public/uploads", filename);
        writeFileSync(filePath, buffer);
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

  // Duplicate check
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
