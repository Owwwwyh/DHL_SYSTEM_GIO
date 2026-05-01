import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import bcrypt from "bcryptjs";

export async function GET() {
  const { error, userId } = await requireRole("editor");
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(req: NextRequest) {
  const { error, userId } = await requireRole("editor");
  if (error) return error;

  const body = await req.json();

  // Update name
  if (body.name !== undefined && !body.currentPassword) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: body.name.trim() },
      select: { id: true, email: true, name: true, role: true },
    });
    return NextResponse.json(user);
  }

  // Change password
  if (body.currentPassword && body.newPassword) {
    if (body.newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const valid = await bcrypt.compare(body.currentPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}
