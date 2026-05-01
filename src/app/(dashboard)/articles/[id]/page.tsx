"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";

interface Version {
  id: string;
  action: string;
  status: string;
  note: string | null;
  createdAt: string;
  user: { name: string | null; email: string } | null;
}

interface Article {
  id: string;
  title: string;
  summary: string;
  steps: string;
  tags: string;
  relatedLinks: string;
  sourceType: string;
  status: string;
  hasConflict: boolean;
  conflictNote: string | null;
  updatedAt: string;
  user?: { name: string | null; email: string };
}

const NEXT_STATUS: Record<string, { label: string; to: string; color: string }> = {
  draft:     { label: "Submit for Review →", to: "reviewed",  color: "bg-blue-600 hover:bg-blue-700 text-white" },
  reviewed:  { label: "🚀 Publish",          to: "published", color: "bg-green-600 hover:bg-green-700 text-white" },
  published: { label: "Archive",             to: "archived",  color: "bg-gray-200 hover:bg-gray-300 text-gray-700" },
  archived:  { label: "Restore to Draft",    to: "draft",     color: "bg-gray-200 hover:bg-gray-300 text-gray-700" },
};

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [article, setArticle] = useState<Article | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [relatedLinks, setRelatedLinks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function loadArticle() {
    const [aRes, vRes] = await Promise.all([
      fetch(`/api/articles/${id}`),
      fetch(`/api/articles/${id}/versions`),
    ]);
    if (aRes.status === 404) { notFound(); return; }
    const a = await aRes.json();
    setArticle(a);
    setTitle(a.title);
    setSummary(a.summary);
    setSteps(JSON.parse(a.steps || "[]"));
    setTags(JSON.parse(a.tags || "[]"));
    setRelatedLinks(JSON.parse(a.relatedLinks || "[]"));
    setVersions(await vRes.json());
  }

  useEffect(() => { loadArticle(); }, [id]);

  async function save() {
    // Field-level validation
    const saveErrors: string[] = [];
    if (!title.trim()) saveErrors.push("Title is required");
    if (summary.trim().length < 10) saveErrors.push("Summary must be at least 10 characters");
    if (steps.filter(s => s.trim()).length === 0) saveErrors.push("At least one step is required");
    if (tags.length === 0) saveErrors.push("At least one tag is required");
    if (saveErrors.length > 0) {
      toast.error(saveErrors[0]);
      return;
    }

    setSaving(true);
    try {
      await fetch(`/api/articles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary, steps, tags, relatedLinks }),
      });
      await loadArticle();
      setEditing(false);
      setSaving(false);
      toast.success("Article saved successfully");
    } catch {
      setSaving(false);
      toast.error("Failed to save article");
    }
  }

  async function transition(toStatus: string) {
    setTransitioning(true);
    try {
      await fetch(`/api/articles/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toStatus }),
      });
      await loadArticle();
      setTransitioning(false);
      toast.success(`Article status updated to ${toStatus}`);
    } catch {
      setTransitioning(false);
      toast.error("Failed to update status");
    }
  }

  async function deleteArticle() {
    if (!confirm("Delete this article permanently?")) return;
    await fetch(`/api/articles/${id}`, { method: "DELETE" });
    toast.info("Article deleted");
    router.push("/articles");
  }

  if (!article) return (
    <div className="p-8 text-gray-400 flex items-center gap-2">
      <span className="animate-spin">⟳</span> Loading...
    </div>
  );

  const typeIcon: Record<string, string> = {
    email: "📧", chat: "💬", screenshot: "🖼️", note: "✍️",
    powerpoint: "📊", pdf: "📄", docx: "📝", manual: "✏️",
  };
  const nextAction = NEXT_STATUS[article.status];
  const actionIcons: Record<string, string> = { created: "🆕", edited: "✏️", status_changed: "🔄" };

  return (
    <div className="p-8">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-5 flex items-center gap-1">
        ← Back
      </button>

      <div className="flex gap-6 max-w-5xl">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Conflict alert */}
          {article.hasConflict && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5 flex gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-semibold text-orange-800 text-sm">Potential Conflict Detected</p>
                <p className="text-orange-600 text-sm mt-1">
                  {article.conflictNote ?? "This article may overlap with existing published content. Review carefully."}
                </p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <span className="text-xl">{typeIcon[article.sourceType] ?? "📄"}</span>
            <StatusBadge status={article.status} />
            <span className="text-xs text-gray-400">
              Updated {new Date(article.updatedAt).toLocaleString()}
              {article.user && ` · by ${article.user.name ?? article.user.email}`}
            </span>
          </div>

          {editing ? (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Summary</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Steps (one per line)</label>
                <textarea
                  value={steps.join("\n")}
                  onChange={(e) => setSteps(e.target.value.split("\n"))}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red resize-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tags (comma separated)</label>
                <input
                  value={tags.join(", ")}
                  onChange={(e) => setTags(e.target.value.split(",").map(t => t.trim()).filter(Boolean))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Related Links (one per line)</label>
                <textarea
                  value={relatedLinks.join("\n")}
                  onChange={(e) => setRelatedLinks(e.target.value.split("\n").filter(Boolean))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-dhl-red text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-3">{article.title}</h1>
              <p className="text-gray-600 leading-relaxed mb-6">{article.summary}</p>

              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Procedure Steps</h2>
              <ol className="space-y-3 mb-6">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="bg-dhl-red text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-gray-700 text-sm leading-relaxed">{s.replace(/^Step \d+:\s*/i, "")}</span>
                  </li>
                ))}
              </ol>

              {relatedLinks.length > 0 && (
                <>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Related Links</h2>
                  <ul className="space-y-1 mb-6">
                    {relatedLinks.map((l, i) => (
                      <li key={i} className="text-sm text-blue-600 flex items-center gap-1">
                        <span>🔗</span> {l}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="flex flex-wrap gap-1 mb-6">
                {tags.map((t) => (
                  <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{t}</span>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setEditing(true)}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200"
                >
                  ✏️ Edit
                </button>
                {nextAction && (
                  <button
                    onClick={() => transition(nextAction.to)}
                    disabled={transitioning}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${nextAction.color}`}
                  >
                    {transitioning ? "..." : nextAction.label}
                  </button>
                )}
                <a
                  href={`/articles/${article.id}/print`}
                  target="_blank"
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200"
                >
                  🖨️ Print
                </a>
                <button
                  onClick={deleteArticle}
                  className="ml-auto text-red-400 px-4 py-2 rounded-lg text-sm hover:text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Version history sidebar */}
        <div className="w-72 shrink-0">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between bg-white rounded-xl shadow-sm p-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 mb-2"
          >
            <span>📋 Version History ({versions.length})</span>
            <span>{showHistory ? "▲" : "▼"}</span>
          </button>

          {showHistory && versions.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              {versions.map((v, i) => (
                <div key={v.id} className="relative pl-5">
                  {i < versions.length - 1 && (
                    <div className="absolute left-1.5 top-5 bottom-0 w-px bg-gray-100" />
                  )}
                  <div className="absolute left-0 top-1.5 w-3 h-3 rounded-full bg-gray-200 border-2 border-white" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{actionIcons[v.action] ?? "•"}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{v.note ?? v.action}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {v.user?.name ?? v.user?.email ?? "System"} · {new Date(v.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
