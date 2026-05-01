"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import StatusBadge from "@/components/StatusBadge";

const mainNav = [
  { href: "/",        label: "Dashboard",   icon: "📊" },
  { href: "/upload",  label: "Upload Input", icon: "⬆️" },
  { href: "/review",  label: "Review Queue", icon: "📋" },
  { href: "/articles", label: "Articles",   icon: "📚" },
];

const systemNav = [
  { href: "/api-docs", label: "API Docs",   icon: "📡" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as { email?: string; name?: string; role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col shrink-0 no-print">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="bg-dhl-red text-white font-black px-2 py-0.5 rounded text-sm">DHL</span>
            <div>
              <p className="font-semibold text-sm leading-tight">Knowledge Base</p>
              <p className="text-xs text-gray-500 leading-tight">SOP Management</p>
            </div>
          </div>
        </div>

        {/* Main Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-3 mb-2">Main</p>
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-dhl-red text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          <div className="pt-3 pb-1">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider px-3 mb-2">System</p>
          </div>

          {systemNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-dhl-red text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {isAdmin && (
            <Link
              href="/admin/users"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive("/admin")
                  ? "bg-dhl-red text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <span>⚙️</span>
              Admin Panel
            </Link>
          )}
        </nav>

        {/* User section */}
        <div className="px-4 py-4 border-t border-gray-700 shrink-0">
          <Link href="/profile" className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-full bg-dhl-red flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(user?.name ?? user?.email ?? "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate leading-tight">{user?.name ?? "My Profile"}</p>
              <p className="text-xs text-gray-400 truncate leading-tight">{user?.email}</p>
            </div>
            {user?.role && (
              <div className="shrink-0">
                <StatusBadge status={user.role} />
              </div>
            )}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-gray-500 hover:text-white transition-colors"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
