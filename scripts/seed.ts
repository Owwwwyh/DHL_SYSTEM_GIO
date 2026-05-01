import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPwd = await bcrypt.hash("admin123", 10);
  const editorPwd = await bcrypt.hash("editor123", 10);

  await prisma.user.upsert({
    where: { email: "admin@dhl.com" },
    update: {},
    create: { email: "admin@dhl.com", name: "DHL Admin", password: adminPwd, role: "admin" },
  });

  await prisma.user.upsert({
    where: { email: "editor@dhl.com" },
    update: {},
    create: { email: "editor@dhl.com", name: "KB Editor", password: editorPwd, role: "editor" },
  });

  console.log("✅ Seed complete.");
  console.log("   Admin:  admin@dhl.com  / admin123");
  console.log("   Editor: editor@dhl.com / editor123");
}

main().catch(console.error).finally(() => prisma.$disconnect());
