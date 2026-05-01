import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import bcrypt from "bcryptjs";

const USER_SELECT = {
  id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: USER_SELECT,
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, userId } = await requireRole("admin");
  if (error) return error;

  const body = await req.json();

  // Prevent self-deactivation
  if (body.isActive === false && params.id === userId) {
    return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
  }

  if (body.role && !["admin", "reviewer", "editor"].includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (body.password !== undefined && body.password !== "" && body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name || null;
  if (body.role !== undefined) updateData.role = body.role;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.password) updateData.password = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
    select: USER_SELECT,
  });

  return NextResponse.json(user);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, userId } = await requireRole("admin");
  if (error) return error;

  if (params.id === userId) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
