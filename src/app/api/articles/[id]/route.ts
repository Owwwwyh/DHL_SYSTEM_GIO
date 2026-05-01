import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = req.headers.get("x-api-key");
  const isUiPath = apiKey === process.env.UIPATH_API_KEY;
  if (!isUiPath) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const article = await prisma.article.findUnique({
    where: { id: params.id },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(article);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = req.headers.get("x-api-key");
  const isUiPath = apiKey === process.env.UIPATH_API_KEY;

  let userId: string | undefined;
  if (!isUiPath) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = (session.user as { id?: string }).id;
  }
  const body = await req.json();

  const current = await prisma.article.findUnique({ where: { id: params.id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.article.update({
    where: { id: params.id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.summary !== undefined && { summary: body.summary }),
      ...(body.steps !== undefined && { steps: JSON.stringify(body.steps) }),
      ...(body.tags !== undefined && { tags: JSON.stringify(body.tags) }),
      ...(body.relatedLinks !== undefined && { relatedLinks: JSON.stringify(body.relatedLinks) }),
      ...(body.status !== undefined && { status: body.status }),
    },
  });

  // Log edit version
  if (body.title || body.summary || body.steps || body.tags) {
    await prisma.articleVersion.create({
      data: {
        articleId: params.id,
        status: updated.status,
        title: updated.title,
        summary: updated.summary,
        steps: updated.steps,
        tags: updated.tags,
        action: "edited",
        note: "Content edited",
        userId,
      },
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireRole("reviewer");
  if (error) return error;

  const existing = await prisma.article.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.article.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
