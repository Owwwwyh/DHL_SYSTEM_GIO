import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeHash } from "@/lib/fileParser";
import { rateLimit } from "@/lib/rateLimit";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { scope: "duplicate-check", capacity: 60, refillPerSec: 1 });
  if (limited) return limited;

  const body = await req.json();
  const { content, fileHash } = body;

  const hash = fileHash ?? (content ? computeHash(content) : null);
  if (!hash) {
    return NextResponse.json({ isDuplicate: false, hash: null });
  }

  const cutoff = new Date(Date.now() - FOURTEEN_DAYS_MS);

  const existing = await prisma.rawInput.findFirst({
    where: {
      fileHash: hash,
      createdAt: { gte: cutoff },
    },
    select: { id: true, createdAt: true, status: true },
  });

  return NextResponse.json({
    isDuplicate: !!existing,
    hash,
    existingId: existing?.id ?? null,
    existingDate: existing?.createdAt ?? null,
  });
}
