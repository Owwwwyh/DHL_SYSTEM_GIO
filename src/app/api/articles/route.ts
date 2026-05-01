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

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status");
  const tag = searchParams.get("tag");
  const creator = searchParams.get("creator");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));
  const skip = (page - 1) * pageSize;

  const where = {
    ...(status ? { status } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q } },
        { summary: { contains: q } },
        { tags: { contains: q } },
      ],
    } : {}),
    ...(tag ? { tags: { contains: tag } } : {}),
    ...(creator ? { userId: creator } : {}),
    ...(from || to ? {
      createdAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    } : {}),
  };

  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { id: true, name: true, email: true } } },
      skip,
      take: pageSize,
    }),
    prisma.article.count({ where }),
  ]);

  return NextResponse.json({
    articles,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page * pageSize < total,
      hasPrev: page > 1,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  const body = await req.json();

  const article = await prisma.article.create({
    data: {
      title: body.title,
      summary: body.summary,
      steps: JSON.stringify(body.steps ?? []),
      tags: JSON.stringify(body.tags ?? []),
      relatedLinks: JSON.stringify(body.relatedLinks ?? []),
      sourceType: body.sourceType ?? "manual",
      status: "draft",
      userId,
    },
  });

  await prisma.articleVersion.create({
    data: {
      articleId: article.id,
      status: "draft",
      action: "created",
      note: "Manually created",
      userId,
    },
  });

  return NextResponse.json(article, { status: 201 });
}
