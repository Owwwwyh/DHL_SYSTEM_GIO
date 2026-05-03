import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function generatePassword(): string {
  // 16 url-safe characters; entropy ~96 bits.
  return randomBytes(12).toString("base64url");
}

async function ensureUser(email: string, name: string, role: string, envVar: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`   ${role.padEnd(7)} ${email.padEnd(20)} (already exists — password unchanged)`);
    return;
  }

  const fromEnv = process.env[envVar];
  const plainPwd = fromEnv && fromEnv.length >= 8 ? fromEnv : generatePassword();
  const hashed = await bcrypt.hash(plainPwd, 10);

  await prisma.user.create({
    data: { email, name, password: hashed, role },
  });

  if (fromEnv) {
    console.log(`   ${role.padEnd(7)} ${email.padEnd(20)} (password from $${envVar})`);
  } else {
    console.log(`   ${role.padEnd(7)} ${email.padEnd(20)} ${plainPwd}   <-- SAVE THIS NOW`);
  }
}

async function main() {
  console.log("Seeding starter accounts...");
  console.log("   Set SEED_ADMIN_PASSWORD / SEED_EDITOR_PASSWORD to control passwords;");
  console.log("   otherwise a random one is generated and printed here only.\n");

  await ensureUser("admin@dhl.com", "DHL Admin", "admin", "SEED_ADMIN_PASSWORD");
  await ensureUser("editor@dhl.com", "KB Editor", "editor", "SEED_EDITOR_PASSWORD");

  console.log("\nSeed complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
