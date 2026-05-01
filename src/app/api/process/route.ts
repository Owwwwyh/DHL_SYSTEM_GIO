import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processTextInput, processImageInput, detectConflict } from "@/lib/gemini";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const isUiPath = apiKey === process.env.UIPATH_API_KEY;

  if (!isUiPath) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rawInputId } = await req.json();
  if (!rawInputId) return NextResponse.json({ error: "rawInputId required" }, { status: 400 });

  const raw = await prisma.rawInput.findUnique({
    where: { id: rawInputId },
    include: { article: { select: { id: true } } },
  });
  if (!raw) return NextResponse.json({ error: "Input not found" }, { status: 404 });
  if (raw.article) return NextResponse.json({ error: "Already processed" }, { status: 400 });

  await prisma.rawInput.update({ where: { id: rawInputId }, data: { status: "processing" } });

  const session = isUiPath ? null : await getServerSession(authOptions);
  const sessionUserId = (session?.user as { id?: string })?.id;
  // Defensive: if the JWT points to a user that no longer exists (e.g. DB was reseeded
  // while the browser still holds an old token), drop the FK instead of crashing.
  let userId: string | undefined;
  if (sessionUserId) {
    const exists = await prisma.user.findUnique({ where: { id: sessionUserId }, select: { id: true } });
    userId = exists?.id;
  }

  try {
    let processed;
    if (raw.type === "screenshot" && raw.filePath) {
      processed = await processImageInput(raw.type, raw.filePath, raw.content);
    } else {
      processed = await processTextInput(raw.type, raw.content);
    }

    // Fetch published articles with overlapping tags for real conflict detection
    const newTagsArray: string[] = processed.tags ?? [];
    const existingPublished = newTagsArray.length > 0
      ? await prisma.article.findMany({
          where: {
            status: "published",
            OR: newTagsArray.slice(0, 5).map((tag) => ({ tags: { contains: tag } })),
          },
          select: { id: true, title: true, tags: true, summary: true },
          take: 20,
        })
      : [];

    const { hasConflict, note } = await detectConflict(
      processed.title,
      processed.tags,
      processed.summary,
      existingPublished
    );

    const article = await prisma.article.create({
      data: {
        title: processed.title,
        summary: processed.summary,
        steps: JSON.stringify(processed.steps),
        tags: JSON.stringify(processed.tags),
        relatedLinks: JSON.stringify(processed.relatedLinks ?? []),
        sourceType: raw.type,
        status: "draft",
        hasConflict,
        conflictNote: note || null,
        rawInputId: raw.id,
        userId,
      },
    });

    // Log initial version
    await prisma.articleVersion.create({
      data: {
        articleId: article.id,
        status: "draft",
        title: article.title,
        summary: article.summary,
        steps: article.steps,
        tags: article.tags,
        action: "created",
        note: `Created from ${raw.type} via ${isUiPath ? "UiPath RPA" : "web upload"}`,
        userId,
      },
    });

    await prisma.rawInput.update({ where: { id: rawInputId }, data: { status: "done" } });

    return NextResponse.json({ article });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await prisma.rawInput.update({
      where: { id: rawInputId },
      data: { status: "failed", errorMsg: msg },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
