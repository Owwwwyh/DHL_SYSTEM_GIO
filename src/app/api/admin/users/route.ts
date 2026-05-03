import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import bcrypt from "bcryptjs";

const USER_SELECT = {
  id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
} as const;

export async function GET(req: NextRequest) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const users = await prisma.user.findMany({
    where: q ? {
      OR: [
        { email: { contains: q } },
        { name: { contains: q } },
      ],
    } : undefined,
    select: USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const body = await req.json();
  const { email, password, name, role } = body;

  if (!email || !password || !role) {
    return NextResponse.json({ error: "email, password and role are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!["admin", "reviewer", "editor"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  // Admin-created users must rotate the temporary password on first login
  // (P2-4 in IssueDoc.md). The /auth/change-password page clears the flag.
  const user = await prisma.user.create({
    data: { email, name: name || null, password: hashedPassword, role, mustChangePassword: true },
    select: USER_SELECT,
  });

  return NextResponse.json(user, { status: 201 });
}
