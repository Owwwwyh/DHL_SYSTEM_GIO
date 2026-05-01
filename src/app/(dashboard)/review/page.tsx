"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { SkeletonRow } from "@/components/Skeleton";
import { useToast } from "@/components/ToastProvider";

interface Article {
  id: string;
  title: string;
  summary: string;
  steps: string;
  tags: string;
  sourceType: string;
  status: string;
  hasConflict: boolean;
  conflictNote: string | null;
  createdAt: string;
  user?: { name: string | null; email: string };
}

const typeIcon: Record<string, string> = {
  email: "📧", chat: "💬", screenshot: "🖼️", note: "✍️",
  powerpoint: "📊", pdf: "📄", docx: "📝", manual: "✏️",
};

export default function ReviewPage() {
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"draft" | "reviewed">("draft");
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);

  async function load(tab = activeTab) {
    setLoading(true);
    const res = await fetch(`/api/articles?status=${tab}`);
    const data = await res.json();
    // Support both paginated response and plain array
    setArticles(Array.isArray(data) ? data : data.articles ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function transition(id: string, toStatus: string, note?: string) {
    setActing(id);
    await fetch(`/api/articles/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: toStatus, note }),
    });
    await load();
    setActing(null);
    toast.success(
      `Article ${toStatus === "reviewed" ? "approved" : toStatus === "published" ? "published" : toStatus}`
    );
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === articles.length) setSelected(new Set());
    else setSelected(new Set(articles.map(a => a.id)));
  }

  async function bulkTransition(toStatus: string) {
    setBulkActing(true);
    await Promise.all(
      Array.from(selected).map(id =>
        fetch(`/api/articles/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: toStatus, note: `Bulk ${toStatus}` }),
        })
      )
    );
    const count = selected.size;
    setSelected(new Set());
    await load();
    setBulkActing(false);
    toast.success(
      `${count} article${count > 1 ? "s" : ""} ${
        toStatus === "published"
          ? "published"
          : toStatus === "reviewed"
          ? "approved for review"
          : "archived"
      }`
    );
  }

  const tabs = [
    { id: "draft",    label: "Drafts",   icon: "📝" },
    { id: "reviewed", label: "Reviewed", icon: "🔍" },
  ] as const;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="text-gray-500 mt-1">Manage the Draft → Reviewed → Published workflow.</p>
      </div>

      {/* Status pipeline visual */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex items-center gap-2 text-sm font-medium overflow-x-auto">
        {[
          { status: "draft",     label: "1. Draft",     color: "bg-gray-100 text-gray-600" },
          { status: "arrow",     label: "→",            color: "text-gray-300" },
          { status: "reviewed",  label: "2. Reviewed",  color: "bg-blue-100 text-blue-600" },
          { status: "arrow2",    label: "→",            color: "text-gray-300" },
          { status: "published", label: "3. Published", color: "bg-green-100 text-green-700" },
        ].map((s) =>
          s.status.startsWith("arrow") ? (
            <span key={s.status} className={s.color}>{s.label}</span>
          ) : (
            <span key={s.status} className={`px-3 py-1.5 rounded-lg ${s.color}`}>{s.label}</span>
          )
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id);
              setSelected(new Set());
              load(t.id);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 bg-dhl-yellow rounded-xl px-5 py-3 mb-4 flex items-center gap-4 shadow-md">
          <span className="font-bold text-gray-900 text-sm">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            {activeTab === "draft" && (
              <button
                onClick={() => bulkTransition("reviewed")}
                disabled={bulkActing}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {bulkActing ? "..." : "✓ Bulk Approve"}
              </button>
            )}
            {activeTab === "reviewed" && (
              <button
                onClick={() => bulkTransition("published")}
                disabled={bulkActing}
                className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-60"
              >
                {bulkActing ? "..." : "🚀 Bulk Publish"}
              </button>
            )}
            <button
              onClick={() => bulkTransition("archived")}
              disabled={bulkActing}
              className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-300 disabled:opacity-60"
            >
              Archive Selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-gray-600 text-sm px-2 hover:text-gray-900"
            >
              ✕ Clear
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : articles.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="text-5xl mb-3">{activeTab === "draft" ? "📭" : "✅"}</div>
          <h3 className="text-lg font-semibold text-gray-700">
            {activeTab === "draft" ? "No drafts to review" : "No reviewed articles pending publish"}
          </h3>
          <p className="text-gray-400 mt-1 text-sm">
            {activeTab === "draft"
              ? "Upload inputs to generate new drafts."
              : "Switch to the Drafts tab to find articles to review."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Select all row */}
          {articles.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={selected.size === articles.length && articles.length > 0}
                onChange={selectAll}
                className="w-4 h-4 accent-dhl-red"
              />
              Select all {articles.length}
            </label>
          )}

          {articles.map((a) => {
            const tags: string[] = JSON.parse(a.tags || "[]");
            const steps: string[] = JSON.parse(a.steps || "[]");

            return (
              <div
                key={a.id}
                className={`bg-white rounded-xl shadow-sm p-6 ${a.hasConflict ? "border-l-4 border-orange-400" : ""}`}
              >
                {a.hasConflict && (
                  <div className="bg-orange-50 text-orange-700 text-xs px-3 py-2 rounded-lg mb-4 flex items-start gap-2">
                    <span>⚠️</span>
                    <span>
                      <strong>Potential Conflict:</strong>{" "}
                      {a.conflictNote || "This article may overlap with existing published content. Review carefully before publishing."}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        className="w-4 h-4 accent-dhl-red shrink-0 mt-1 cursor-pointer"
                      />
                      <span>{typeIcon[a.sourceType] ?? "📄"}</span>
                      <StatusBadge status={a.status} />
                      <span className="text-xs text-gray-400">{new Date(a.createdAt).toLocaleDateString()}</span>
                      {a.user && <span className="text-xs text-gray-400">by {a.user.name ?? a.user.email}</span>}
                    </div>

                    <h3 className="font-bold text-gray-900 text-lg mb-2">{a.title}</h3>
                    <p className="text-gray-600 text-sm mb-3">{a.summary}</p>

                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <p className="text-xs font-semibold text-gray-400 mb-2">STEPS PREVIEW</p>
                      <ol className="space-y-1">
                        {steps.slice(0, 3).map((s, i) => (
                          <li key={i} className="text-sm text-gray-700 flex gap-2">
                            <span className="text-dhl-red font-bold shrink-0">{i + 1}.</span>
                            <span>{s.replace(/^Step \d+:\s*/i, "")}</span>
                          </li>
                        ))}
                        {steps.length > 3 && (
                          <li className="text-xs text-gray-400 pl-5">+{steps.length - 3} more steps</li>
                        )}
                      </ol>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0 min-w-[130px]">
                    {activeTab === "draft" ? (
                      <>
                        <button
                          onClick={() => transition(a.id, "reviewed", "Reviewed and approved")}
                          disabled={acting === a.id}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                        >
                          {acting === a.id ? "..." : "✓ Approve"}
                        </button>
                        <button
                          onClick={() => router.push(`/articles/${a.id}`)}
                          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => transition(a.id, "archived", "Archived from draft")}
                          className="text-gray-400 px-4 py-1.5 rounded-lg text-sm hover:text-gray-600 hover:bg-gray-50"
                        >
                          Archive
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => transition(a.id, "published", "Published to knowledge base")}
                          disabled={acting === a.id}
                          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-60"
                        >
                          {acting === a.id ? "..." : "🚀 Publish"}
                        </button>
                        <button
                          onClick={() => transition(a.id, "draft", "Sent back to draft for revision")}
                          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200"
                        >
                          ← Revise
                        </button>
                        <button
                          onClick={() => router.push(`/articles/${a.id}`)}
                          className="text-gray-400 px-4 py-1.5 rounded-lg text-sm hover:text-gray-600 hover:bg-gray-50"
                        >
                          View
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
