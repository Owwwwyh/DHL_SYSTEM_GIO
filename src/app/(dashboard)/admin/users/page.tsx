"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { useToast } from "@/components/ToastProvider";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

function UserRowSkeleton() {
  return (
    <tr className="animate-pulse">
      {[1,2,3,4,5,6].map(i => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  async function load(q = search) {
    setLoading(true);
    const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
    setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(user: User) {
    setActing(user.id);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`${user.name ?? user.email} ${data.isActive ? "activated" : "deactivated"}`);
      await load();
    } else {
      toast.error(data.error ?? "Failed to update user");
    }
    setActing(null);
  }

  async function deleteUser(user: User) {
    if (!confirm(`Permanently delete ${user.email}? This cannot be undone.`)) return;
    setActing(user.id);
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`${user.email} deleted`);
      await load();
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to delete user");
    }
    setActing(null);
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 mt-1">{users.length} user{users.length !== 1 ? "s" : ""} in the system</p>
        </div>
        <Link href="/admin/users/new"
          className="bg-dhl-red text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
          + Create User
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search by name or email..."
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
        />
        <button onClick={() => load()} className="bg-dhl-red text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700">
          Search
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {["Name", "Email", "Role", "Status", "Created", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <UserRowSkeleton key={i} />)
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${!u.isActive ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3"><StatusBadge status={u.role} /></td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.isActive ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/users/${u.id}`}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 rounded hover:bg-blue-50">
                        Edit
                      </Link>
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={acting === u.id}
                        className="text-xs font-medium px-2 py-1 rounded transition-colors disabled:opacity-50 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      >
                        {acting === u.id ? "..." : u.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => deleteUser(u)}
                        disabled={acting === u.id}
                        className="text-xs font-medium px-2 py-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
