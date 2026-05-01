import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { NextResponse } from "next/server";

export type Role = "editor" | "reviewer" | "admin";

const HIERARCHY: Role[] = ["editor", "reviewer", "admin"];

export async function requireRole(minRole: Role): Promise<
  | { session: Awaited<ReturnType<typeof getServerSession>>; userId: string; role: Role; error: null }
  | { session: null; userId: null; role: null; error: NextResponse }
> {
  const session = await getServerSession(authOptions);

  if (!session) {
    return { session: null, userId: null, role: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = session.user as { id?: string; role?: string; isActive?: boolean };
  const role = (user.role ?? "editor") as Role;

  if (HIERARCHY.indexOf(role) < HIERARCHY.indexOf(minRole)) {
    return { session: null, userId: null, role: null, error: NextResponse.json({ error: "Forbidden — insufficient role" }, { status: 403 }) };
  }

  return { session, userId: user.id!, role, error: null };
}
