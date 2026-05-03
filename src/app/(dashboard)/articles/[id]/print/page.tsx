import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function PrintPage({ params }: { params: { id: string } }) {
  const article = await prisma.article.findUnique({
    where: { id: params.id },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!article || article.deletedAt) notFound();

  const steps: string[] = article.steps ?? [];
  const tags: string[] = article.tags ?? [];
  const relatedLinks: string[] = article.relatedLinks ?? [];

  return (
    <html>
      <head>
        <title>{article.title} — DHL Knowledge Base</title>
        <style>{`
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #111; }
          .header { border-bottom: 3px solid #D40511; padding-bottom: 16px; margin-bottom: 24px; }
          .dhl-logo { background: #D40511; color: white; font-weight: 900; padding: 4px 10px; border-radius: 4px; font-size: 18px; display: inline-block; margin-right: 12px; }
          h1 { font-size: 22px; margin: 16px 0 8px; }
          .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
          .section-title { font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.1em; margin: 24px 0 12px; border-top: 1px solid #eee; padding-top: 16px; }
          .summary { background: #f9f9f9; border-left: 4px solid #D40511; padding: 12px 16px; margin-bottom: 16px; font-size: 14px; line-height: 1.6; }
          ol { padding-left: 0; list-style: none; }
          li { display: flex; gap: 12px; margin-bottom: 10px; font-size: 14px; line-height: 1.6; }
          .step-num { background: #D40511; color: white; min-width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 1px; }
          .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .tag { background: #f0f0f0; padding: 3px 10px; border-radius: 20px; font-size: 12px; }
          .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #ddd; color: #aaa; font-size: 11px; display: flex; justify-content: space-between; }
          @media print { button { display: none !important; } }
        `}</style>
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: "window.onload = function() { window.print(); }" }} />

        <div className="header" style={{ borderBottom: "3px solid #D40511", paddingBottom: "16px", marginBottom: "24px" }}>
          <span style={{ background: "#D40511", color: "white", fontWeight: 900, padding: "4px 10px", borderRadius: "4px", fontSize: "18px", marginRight: "12px" }}>DHL</span>
          <span style={{ color: "#666", fontSize: "13px" }}>Knowledge Base — Standard Operating Procedure</span>
        </div>

        <h1 style={{ fontSize: "22px", margin: "16px 0 8px" }}>{article.title}</h1>

        <div style={{ color: "#666", fontSize: "13px", marginBottom: "24px" }}>
          <span>Status: <strong>{article.status.toUpperCase()}</strong></span>
          {" · "}
          <span>Source: {article.sourceType}</span>
          {" · "}
          <span>Updated: {new Date(article.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
          {article.user && <span> · Author: {article.user.name ?? article.user.email}</span>}
        </div>

        <p style={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Summary</p>
        <div style={{ background: "#f9f9f9", borderLeft: "4px solid #D40511", padding: "12px 16px", marginBottom: "24px", fontSize: "14px", lineHeight: 1.6 }}>
          {article.summary}
        </div>

        <p style={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px", borderTop: "1px solid #eee", paddingTop: "16px" }}>
          Procedure Steps ({steps.length})
        </p>
        <ol style={{ paddingLeft: 0, listStyle: "none" }}>
          {steps.map((step, i) => (
            <li key={i} style={{ display: "flex", gap: "12px", marginBottom: "10px", fontSize: "14px", lineHeight: 1.6 }}>
              <span style={{ background: "#D40511", color: "white", minWidth: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700 }}>
                {i + 1}
              </span>
              <span>{step.replace(/^Step \d+:\s*/i, "")}</span>
            </li>
          ))}
        </ol>

        {tags.length > 0 && (
          <>
            <p style={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", margin: "24px 0 8px", borderTop: "1px solid #eee", paddingTop: "16px" }}>Tags</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {tags.map(t => (
                <span key={t} style={{ background: "#f0f0f0", padding: "3px 10px", borderRadius: "20px", fontSize: "12px" }}>{t}</span>
              ))}
            </div>
          </>
        )}

        {relatedLinks.length > 0 && (
          <>
            <p style={{ fontWeight: 700, fontSize: "11px", color: "#666", textTransform: "uppercase", letterSpacing: "0.1em", margin: "24px 0 8px", borderTop: "1px solid #eee", paddingTop: "16px" }}>Related Links</p>
            <ul style={{ paddingLeft: "16px", fontSize: "14px" }}>
              {relatedLinks.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </>
        )}

        <div style={{ marginTop: "48px", paddingTop: "16px", borderTop: "1px solid #ddd", color: "#aaa", fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
          <span>DHL Knowledge Base — CONFIDENTIAL</span>
          <span>Printed: {new Date().toLocaleDateString()}</span>
        </div>
      </body>
    </html>
  );
}
