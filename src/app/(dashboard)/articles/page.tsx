"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { SkeletonCard } from "@/components/Skeleton";
import { useToast } from "@/components/ToastProvider";

interface Article {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  sourceType: string;
  status: string;
  hasConflict: boolean;
  updatedAt: string;
  createdAt: string;
  user?: { id: string; name: string | null; email: string };
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const typeIcon: Record<string, string> = {
  email: "📧", chat: "💬", screenshot: "🖼️", note: "✍️",
  powerpoint: "📊", pdf: "📄", docx: "📝", manual: "✏️",
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "reviewed", label: "Reviewed" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export default function ArticlesPage() {
  const toast = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("published");
  const [tag, setTag] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  async function load(overrides: Record<string, string> = {}) {
    setLoading(true);
    const params = new URLSearchParams({
      q: overrides.q ?? query,
      status: overrides.status ?? status,
      page: overrides.page ?? String(currentPage),
      pageSize: "20",
      ...(overrides.tag ?? tag ? { tag: overrides.tag ?? tag } : {}),
      ...(overrides.from ?? from ? { from: overrides.from ?? from } : {}),
      ...(overrides.to ?? to ? { to: overrides.to ?? to } : {}),
    });
    const res = await fetch(`/api/articles?${params}`);
    const data = await res.json();
    setArticles(data.articles ?? []);
    setPagination(data.pagination ?? null);

    // Extract all unique tags from current result set
    const tags = new Set<string>();
    (data.articles as Article[]).forEach((a) => {
      (a.tags ?? []).forEach((t: string) => tags.add(t));
    });
    if (!(overrides.tag ?? tag)) setAllTags(Array.from(tags).sort());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setCurrentPage(1);
    load({ page: "1" });
  }

  function clearFilters() {
    setQuery("");
    setStatus("published");
    setTag("");
    setFrom("");
    setTo("");
    setCurrentPage(1);
    load({ q: "", status: "published", tag: "", from: "", to: "", page: "1" });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Base</h1>
          <p className="text-gray-500 mt-1">
            {pagination
              ? `${pagination.total} article${pagination.total !== 1 ? "s" : ""} found`
              : `${articles?.length || 0} article${articles?.length !== 1 ? "s" : ""} found`}
          </p>
        </div>
        <Link href="/upload" className="bg-dhl-red text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700">
          + New Article
        </Link>
      </div>

      {/* Filter bar */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-sm p-4 mb-6 space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, summary, tags..."
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
          />
          <button type="submit" className="bg-dhl-red text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700">
            Search
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCurrentPage(1);
              load({ status: e.target.value, page: "1" });
            }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-dhl-red"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <select
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              setCurrentPage(1);
              load({ tag: e.target.value, page: "1" });
            }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-dhl-red"
          >
            <option value="">All Tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setCurrentPage(1);
              load({ from: e.target.value, page: "1" });
            }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
            placeholder="From date"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setCurrentPage(1);
              load({ to: e.target.value, page: "1" });
            }}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
            placeholder="To date"
          />

          {(query || status !== "published" || tag || from || to) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100"
            >
              ✕ Clear filters
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (articles?.length ?? 0) === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="text-5xl mb-3">📭</div>
          <h3 className="text-lg font-semibold text-gray-700">No articles found</h3>
          <p className="text-gray-400 mt-1 text-sm">Try adjusting your filters or upload new inputs.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {articles?.map((a) => {
              const tags: string[] = a.tags ?? [];
              return (
                <Link
                  key={a.id}
                  href={`/articles/${a.id}`}
                  className={`bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow block ${a.hasConflict ? "border-l-4 border-orange-400" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-sm">{typeIcon[a.sourceType] ?? "📄"}</span>
                    <StatusBadge status={a.status} />
                    {a.hasConflict && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">⚠️ Conflict</span>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">{new Date(a.updatedAt).toLocaleDateString()}</span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1 line-clamp-2">{a.title}</h3>
                  <p className="text-gray-500 text-sm mb-3 line-clamp-2">{a.summary}</p>
                  <div className="flex flex-wrap gap-1">
                    {tags.slice(0, 5).map((t) => (
                      <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                    {tags.length > 5 && <span className="text-xs text-gray-400">+{tags.length - 5}</span>}
                  </div>
                  {a.user && (
                    <p className="text-xs text-gray-400 mt-2">by {a.user.name ?? a.user.email}</p>
                  )}
                </Link>
              );
            })}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                disabled={!pagination.hasPrev}
                onClick={() => {
                  setCurrentPage(p => p - 1);
                  load({ page: String(currentPage - 1) });
                }}
                className="px-4 py-2 rounded-lg text-sm bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 font-medium"
              >
                ← Previous
              </button>
              <span className="text-sm text-gray-500">
                Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> · {pagination.total} articles
              </span>
              <button
                disabled={!pagination.hasNext}
                onClick={() => {
                  setCurrentPage(p => p + 1);
                  load({ page: String(currentPage + 1) });
                }}
                className="px-4 py-2 rounded-lg text-sm bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 font-medium"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
