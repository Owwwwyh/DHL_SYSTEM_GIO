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

function Kpi({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <div className="bg-white rounded-lg p-5 border border-gray-200 hover:border-gray-300 transition-colors">
      <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !data.error) setStats(data);
      })
      .catch(() => setStats(null));
  }, []);

  if (!stats) {
    return (
      <div className="p-8 text-gray-400 text-sm">Loading…</div>
    );
  }

  const needsReview = stats.articles.draft;
  const readyToPublish = stats.articles.reviewed;
  const hasConflict = stats.articles.conflicts > 0;
  const hasFailures = stats.recentFailures.length > 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">DHL Knowledge Base</p>
      </div>

      {/* Action banner — appears only when there's something to do */}
      {(needsReview > 0 || readyToPublish > 0 || hasConflict) && (
        <div className="bg-dhl-red/5 border border-dhl-red/20 rounded-lg p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-gray-800">
            {hasConflict && (
              <span className="font-semibold text-dhl-red">
                {stats.articles.conflicts} conflict{stats.articles.conflicts > 1 ? "s" : ""} flagged.{" "}
              </span>
            )}
            {needsReview > 0 && (
              <span>
                {needsReview} draft{needsReview > 1 ? "s" : ""} awaiting review.{" "}
              </span>
            )}
            {readyToPublish > 0 && (
              <span>
                {readyToPublish} reviewed article{readyToPublish > 1 ? "s" : ""} ready to publish.
              </span>
            )}
          </div>
          <Link
            href="/review"
            className="bg-dhl-red text-white px-4 py-2 rounded-md font-semibold text-sm hover:bg-red-700 transition-colors whitespace-nowrap"
          >
            Open review queue →
          </Link>
        </div>
      )}

      {/* 4 KPIs only — clickable to drill down */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Kpi label="Published" value={stats.articles.published} href="/articles?status=published" />
        <Kpi label="In review" value={needsReview + readyToPublish} href="/review" />
        <Kpi label="Total ingested" value={stats.inputs.total} />
        <Kpi label="Failed inputs" value={stats.inputs.failed} />
      </div>

      {/* Primary action */}
      <div className="mb-8">
        <Link
          href="/upload"
          className="inline-block bg-dhl-red text-white px-5 py-2.5 rounded-md font-semibold text-sm hover:bg-red-700 transition-colors"
        >
          + Upload new input
        </Link>
      </div>

      {/* Failures (only if any) */}
      {hasFailures && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-red-800 text-sm mb-2">Recent failures</h2>
          <ul className="space-y-1">
            {stats.recentFailures.slice(0, 3).map((f) => (
              <li key={f.id} className="text-sm text-gray-700">
                <span className="font-mono text-xs text-red-700 mr-2">{f.type}</span>
                {f.errorMsg ?? "Unknown error"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent activity — single compact list */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 text-sm mb-4">Recent activity</h2>
        {stats.recentActivity.length === 0 ? (
          <p className="text-gray-400 text-sm">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {stats.recentActivity.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 truncate">{a.article.title}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {a.action.replace("_", " ")} by {a.user?.name ?? a.user?.email ?? "system"} ·{" "}
                    {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
