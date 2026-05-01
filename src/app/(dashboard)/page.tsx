"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";

interface Stats {
  articles: { total: number; draft: number; reviewed: number; published: number; archived: number; conflicts: number };
  inputs: { total: number; pending: number; done: number; failed: number };
  recentFailures: { id: string; type: string; errorMsg: string | null; updatedAt: string; source: string }[];
  recentActivity: {
    id: string;
    action: string;
    status: string;
    note: string | null;
    createdAt: string;
    article: { title: string };
    user: { name: string | null; email: string } | null;
  }[];
}

function StatCard({
  label, value, sub, color, icon,
}: {
  label: string; value: number; sub?: string; color: string; icon: string;
}) {
  return (
    <div className={`bg-white rounded-xl p-5 border-l-4 ${color} shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && !data.error) setStats(data);
      })
      .catch(() => setStats(null));
  }, []);

  const actionIcons: Record<string, string> = {
    created: "🆕", edited: "✏️", status_changed: "🔄",
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">DHL Knowledge Base — System Overview</p>
      </div>

      {!stats ? (
        <div className="flex items-center gap-2 text-gray-400">
          <span className="animate-spin">⟳</span> Loading...
        </div>
      ) : (
        <>
          {/* Conflict Alert */}
          {(stats?.articles?.conflicts ?? 0) > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-semibold text-orange-800">Conflict Detected</p>
                <p className="text-sm text-orange-600">
                  {stats.articles.conflicts} article{stats.articles.conflicts > 1 ? "s" : ""} flagged as potentially conflicting with existing content.{" "}
                  <Link href="/articles?status=draft" className="underline font-medium">Review now →</Link>
                </p>
              </div>
            </div>
          )}

          {/* Article stats */}
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Article Pipeline</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
            <StatCard label="Total" value={stats.articles.total} color="border-gray-300" icon="📚" />
            <StatCard label="Draft" value={stats.articles.draft} sub="Awaiting review" color="border-gray-400" icon="📝" />
            <StatCard label="Reviewed" value={stats.articles.reviewed} sub="Ready to publish" color="border-blue-500" icon="🔍" />
            <StatCard label="Published" value={stats.articles.published} sub="Live in KB" color="border-green-500" icon="✅" />
            <StatCard label="Archived" value={stats.articles.archived} color="border-zinc-300" icon="🗄️" />
          </div>

          {/* Input stats */}
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ingestion Pipeline (RPA + Web)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard label="Total Ingested" value={stats.inputs.total} color="border-gray-300" icon="📥" />
            <StatCard label="Pending" value={stats.inputs.pending} color="border-yellow-400" icon="⏳" />
            <StatCard label="Processed" value={stats.inputs.done} color="border-green-400" icon="✔️" />
            <StatCard label="Failed" value={stats.inputs.failed} color="border-dhl-red" icon="❌" />
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-3 mb-8">
            <Link href="/upload" className="bg-dhl-red text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors">
              + Upload New Input
            </Link>
            {(stats?.articles?.reviewed ?? 0) > 0 && (
              <Link href="/review" className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors">
                Publish {stats.articles.reviewed} reviewed article{(stats?.articles?.reviewed ?? 0) > 1 ? "s" : ""}
              </Link>
            )}
            {(stats?.articles?.draft ?? 0) > 0 && (
              <Link href="/review" className="bg-dhl-yellow text-gray-900 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-yellow-400 transition-colors">
                Review {stats.articles.draft} draft{(stats?.articles?.draft ?? 0) > 1 ? "s" : ""}
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 mb-4">Recent Activity</h2>
              {stats.recentActivity.length === 0 ? (
                <p className="text-gray-400 text-sm">No activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {stats?.recentActivity?.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 text-sm">
                      <span className="text-lg shrink-0">{actionIcons[a.action] ?? "•"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{a.article.title}</p>
                        <p className="text-gray-400 text-xs">
                          {a.user?.name ?? a.user?.email ?? "System"} · {new Date(a.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Failures */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 mb-4">
                {stats.recentFailures.length > 0 ? "⚠️ Recent Failures" : "System Health"}
              </h2>
              {stats.recentFailures.length === 0 ? (
                <div className="text-center py-4">
                  <span className="text-3xl">✅</span>
                  <p className="text-gray-500 text-sm mt-2">No failures. All systems running.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stats?.recentFailures?.map((f) => (
                    <div key={f.id} className="bg-red-50 rounded-lg px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-dhl-red font-semibold uppercase text-xs">{f.type}</span>
                        <span className="text-xs text-gray-400 uppercase">{f.source}</span>
                        <span className="ml-auto text-xs text-gray-400">
                          {new Date(f.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-gray-600 mt-0.5 text-xs truncate">{f.errorMsg ?? "Unknown error"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
