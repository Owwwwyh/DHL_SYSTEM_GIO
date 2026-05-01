const statusConfig: Record<string, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-gray-100 text-gray-600 border border-gray-200" },
  reviewed:  { label: "Reviewed",  className: "bg-blue-100 text-blue-700 border border-blue-200" },
  published: { label: "Published", className: "bg-green-100 text-green-700 border border-green-200" },
  archived:  { label: "Archived",  className: "bg-zinc-100 text-zinc-500 border border-zinc-200" },
  pending:   { label: "Pending",   className: "bg-yellow-100 text-yellow-700 border border-yellow-200" },
  failed:    { label: "Failed",    className: "bg-red-100 text-red-700 border border-red-200" },
  done:      { label: "Done",      className: "bg-green-100 text-green-700 border border-green-200" },
  admin:     { label: "Admin",     className: "bg-red-100 text-dhl-red border border-red-200" },
  reviewer:  { label: "Reviewer",  className: "bg-purple-100 text-purple-700 border border-purple-200" },
  editor:    { label: "Editor",    className: "bg-gray-100 text-gray-600 border border-gray-200" },
  active:    { label: "Active",    className: "bg-green-100 text-green-700 border border-green-200" },
  inactive:  { label: "Inactive",  className: "bg-zinc-100 text-zinc-500 border border-zinc-200" },
  duplicate: { label: "Duplicate", className: "bg-orange-100 text-orange-700 border border-orange-200" },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { label: status, className: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
