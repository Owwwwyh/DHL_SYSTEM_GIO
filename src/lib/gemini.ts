import { GoogleGenerativeAI } from "@google/generative-ai";
import { readBinary } from "@/lib/fileParser";
import { logger } from "@/lib/logger";

const log = logger("gemini");

const apiKey = process.env.GEMINI_API_KEY;
const hasRealKey = !!apiKey && apiKey !== "your-gemini-api-key-here" && apiKey.length > 10;

// Model name is configurable via GEMINI_MODEL env var; defaults to current flash model.
// (gemini-1.5-flash was retired; the current production flash model is gemini-2.5-flash.)
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const genAI = hasRealKey ? new GoogleGenerativeAI(apiKey!) : null;
const model = genAI ? genAI.getGenerativeModel({ model: MODEL_NAME }) : null;

export interface ProcessedArticle {
  title: string;
  summary: string;
  steps: string[];
  tags: string[];
  relatedLinks: string[];
}

// Heuristic fallback used when GEMINI_API_KEY is not configured.
// Keeps the system fully functional for demos without an LLM key.
function heuristicProcess(type: string, content: string): ProcessedArticle {
  const trimmed = content.trim();
  const firstLine = trimmed.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "Untitled SOP";
  const title = `How to: ${firstLine.slice(0, 80)}${firstLine.length > 80 ? "..." : ""}`;

  const summary =
    trimmed.length > 240
      ? trimmed.slice(0, 240).replace(/\s+\S*$/, "") + "..."
      : trimmed || "No content provided.";

  // Split into candidate steps by bullets / newlines / numbered list / sentences.
  let candidates = trimmed
    .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((s) => s.length > 4);

  if (candidates.length < 2) {
    candidates = trimmed.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }

  const steps = (candidates.length ? candidates : ["Review the content and document procedure."])
    .slice(0, 12)
    .map((s, i) => `Step ${i + 1}: ${s.replace(/^Step \d+:\s*/i, "")}`);

  // Heuristic tags: source type + a few high-frequency keywords.
  const stop = new Set([
    "the","and","for","with","this","that","from","into","have","been","will","your","you","are","but","not","all","any","can","our","its","was","they","their","them","when","what","which",
  ]);
  const freq: Record<string, number> = {};
  for (const w of trimmed.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    if (!stop.has(w)) freq[w] = (freq[w] ?? 0) + 1;
  }
  const keywordTags = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w);
  const tags = Array.from(new Set(["logistics", type, ...keywordTags])).slice(0, 6);

  return { title, summary, steps, tags, relatedLinks: [] };
}

const SYSTEM_CONTEXT = `You are a DHL Logistics knowledge management expert.
Convert raw, unstructured content into clean, professional Standard Operating Procedures (SOP).
Return ONLY valid JSON — no markdown fences, no explanation, just the raw JSON object.`;

function buildPrompt(type: string, content: string): string {
  const labels: Record<string, string> = {
    email: "email thread",
    chat: "chat/Teams/Telegram messages",
    screenshot: "screenshot content",
    note: "handwritten note or quick instruction",
    powerpoint: "PowerPoint/training material",
    pdf: "PDF document",
    docx: "Word document",
  };

  return `${SYSTEM_CONTEXT}

Convert this ${labels[type] ?? "document"} into a DHL Knowledge Base article.

Input content:
${content}

Return ONLY this exact JSON structure (no markdown, no code fences):
{
  "title": "Action-oriented SOP title starting with a verb (e.g. 'How to Process International Returns')",
  "summary": "2-3 sentences explaining what this procedure covers, when to use it, and who it applies to",
  "steps": [
    "Step 1: First clear action",
    "Step 2: Next action with enough detail to follow independently",
    "Step 3: Continue for all steps"
  ],
  "tags": ["logistics", "specific-topic", "department", "process-type"],
  "relatedLinks": ["Related SOP title or system name if mentioned", "Another related process if applicable"]
}`;
}

export async function processTextInput(type: string, content: string): Promise<ProcessedArticle> {
  if (!model) return heuristicProcess(type, content);
  try {
    const result = await model.generateContent(buildPrompt(type, content));
    const text = result.response.text().trim()
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/m, "")
      .trim();
    return JSON.parse(text) as ProcessedArticle;
  } catch (err) {
    log.warn("processTextInput failed, falling back to heuristic", {
      err: err instanceof Error ? err.message : String(err),
      type,
    });
    return heuristicProcess(type, content);
  }
}

export async function processImageInput(
  type: string,
  filePath: string,
  additionalContext = ""
): Promise<ProcessedArticle> {
  if (!model) {
    return heuristicProcess(
      type,
      additionalContext || `Screenshot uploaded: ${filePath.split(/[\\/]/).pop()}`
    );
  }
  const imageData = await readBinary(filePath);
  const base64 = imageData.toString("base64");
  const mimeType = filePath.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";

  const prompt = `${SYSTEM_CONTEXT}

This screenshot shows a DHL logistics process, system, or procedure.
${additionalContext ? `Additional context from uploader: ${additionalContext}` : ""}

Analyze every visible element — text, buttons, steps, warnings, data fields — and convert into a structured SOP article.

Return ONLY this exact JSON (no markdown, no code fences):
{
  "title": "Action-oriented title for what this screenshot demonstrates",
  "summary": "2-3 sentences describing the process shown and when to use it",
  "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "tags": ["logistics", "systems", "process-type"],
  "relatedLinks": ["Related system or SOP if visible"]
}`;

  try {
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64, mimeType } },
    ]);

    const text = result.response.text().trim()
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/m, "")
      .trim();
    return JSON.parse(text) as ProcessedArticle;
  } catch (err) {
    log.warn("processImageInput failed, falling back to heuristic", {
      err: err instanceof Error ? err.message : String(err),
      type,
    });
    return heuristicProcess(type, additionalContext || "Screenshot");
  }
}

export async function detectConflict(
  newTitle: string,
  newTags: string[],
  newSummary: string,
  existingArticles: Array<{ id: string; title: string; tags: string[]; summary: string }>
): Promise<{ hasConflict: boolean; note: string }> {
  if (existingArticles.length === 0 || !model) {
    return { hasConflict: false, note: "" };
  }

  const articleList = existingArticles
    .slice(0, 20)
    .map((a) => {
      const tags = (a.tags ?? []).join(", ");
      return `- "${a.title}" [tags: ${tags}]`;
    })
    .join("\n");

  const prompt = `${SYSTEM_CONTEXT}

A new article is being added to the DHL Knowledge Base.

New article:
- Title: "${newTitle}"
- Summary: "${newSummary}"
- Tags: ${newTags.join(", ")}

Existing PUBLISHED articles (real data from the knowledge base):
${articleList}

Does the new article DUPLICATE or DIRECTLY CONFLICT with any existing article above?
A conflict means: same topic, same procedure, or contradictory instructions for the same process.
Similar topics that COMPLEMENT each other are NOT conflicts.

Return ONLY JSON:
{
  "hasConflict": true or false,
  "note": "If conflict: name the specific existing article it conflicts with and briefly explain why. Otherwise empty string."
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim()
      .replace(/^```json\s*/i, "")
      .replace(/\s*```$/m, "")
      .trim();
    return JSON.parse(text);
  } catch {
    return { hasConflict: false, note: "" };
  }
}
