import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["reviewed", "archived"],
  reviewed: ["published", "draft", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

export async function POST(
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

  const { status, note } = await req.json();
  if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });

  const article = await prisma.article.findUnique({ where: { id: params.id } });
  if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = VALID_TRANSITIONS[article.status] ?? [];
  if (!allowed.includes(status)) {
    return NextResponse.json(
      { error: `Cannot transition from ${article.status} to ${status}` },
      { status: 400 }
    );
  }

  const updated = await prisma.article.update({
    where: { id: params.id },
    data: { status },
  });

  await prisma.articleVersion.create({
    data: {
      articleId: params.id,
      status,
      action: "status_changed",
      note: note ?? `Status changed to ${status}`,
      userId,
    },
  });

  return NextResponse.json(updated);
}
