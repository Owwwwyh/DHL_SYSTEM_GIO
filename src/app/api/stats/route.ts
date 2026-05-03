import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const isUiPath = apiKey === process.env.UIPATH_API_KEY;

  if (!isUiPath) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [
    totalArticles,
    draftArticles,
    reviewedArticles,
    publishedArticles,
    archivedArticles,
    totalInputs,
    pendingInputs,
    failedInputs,
    doneInputs,
    conflictArticles,
  ] = await Promise.all([
    prisma.article.count({ where: { deletedAt: null } }),
    prisma.article.count({ where: { deletedAt: null, status: "draft" } }),
    prisma.article.count({ where: { deletedAt: null, status: "reviewed" } }),
    prisma.article.count({ where: { deletedAt: null, status: "published" } }),
    prisma.article.count({ where: { deletedAt: null, status: "archived" } }),
    prisma.rawInput.count(),
    prisma.rawInput.count({ where: { status: "pending" } }),
    prisma.rawInput.count({ where: { status: "failed" } }),
    prisma.rawInput.count({ where: { status: "done" } }),
    prisma.article.count({ where: { deletedAt: null, hasConflict: true, status: { not: "archived" } } }),
  ]);

  const recentFailures = await prisma.rawInput.findMany({
    where: { status: "failed" },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, type: true, errorMsg: true, updatedAt: true, source: true },
  });

  const recentActivity = await prisma.articleVersion.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      article: { select: { title: true } },
      user: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json({
    articles: {
      total: totalArticles,
      draft: draftArticles,
      reviewed: reviewedArticles,
      published: publishedArticles,
      archived: archivedArticles,
      conflicts: conflictArticles,
    },
    inputs: { total: totalInputs, pending: pendingInputs, done: doneInputs, failed: failedInputs },
    recentFailures,
    recentActivity,
    generatedAt: new Date().toISOString(),
  });
}
