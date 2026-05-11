/**
 * Exports every table to a CSV file under ./submission/
 * Run with: npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" scripts/export-db.ts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

function toCsv(rows: any[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return v.toISOString();
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const headerLine = headers.join(",");
  const lines = rows.map((row) => headers.map((h) => escape(row[h])).join(","));
  return [headerLine, ...lines].join("\r\n");
}

async function main() {
  const outDir = path.join(process.cwd(), "submission");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const rawInputs = await prisma.rawInput.findMany({ orderBy: { createdAt: "asc" } });
  const articles = await prisma.article.findMany({ orderBy: { createdAt: "asc" } });
  const articleVersions = await prisma.articleVersion.findMany({ orderBy: { createdAt: "asc" } });

  fs.writeFileSync(path.join(outDir, "Users.csv"), toCsv(users));
  fs.writeFileSync(path.join(outDir, "RawInputs.csv"), toCsv(rawInputs));
  fs.writeFileSync(path.join(outDir, "Articles.csv"), toCsv(articles));
  fs.writeFileSync(path.join(outDir, "ArticleVersions.csv"), toCsv(articleVersions));

  console.log("Exported to ./submission/");
  console.log(`  Users.csv            ${users.length} rows`);
  console.log(`  RawInputs.csv        ${rawInputs.length} rows`);
  console.log(`  Articles.csv         ${articles.length} rows`);
  console.log(`  ArticleVersions.csv  ${articleVersions.length} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
