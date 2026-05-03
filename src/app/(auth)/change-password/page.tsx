"use client";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update, data: session } = useSession();

  // ?forced=1 lands users here after login when mustChangePassword is true.
  const forced = searchParams.get("forced") === "1";
  const next = searchParams.get("next") || "/";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must differ from your current one.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || `Failed (HTTP ${res.status})`);
      return;
    }

    // Refresh the JWT so mustChangePassword is cleared without a re-login.
    await update();
    router.push(next);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md">
        <div className="bg-dhl-red text-white text-center py-6 rounded-t-xl">
          <div className="flex items-center justify-center gap-3 mb-1">
            <span className="text-3xl font-black tracking-tight">DHL</span>
            <span className="w-px h-8 bg-white/40" />
            <span className="text-lg font-semibold">Knowledge Base</span>
          </div>
          <p className="text-red-100 text-sm">Change password</p>
        </div>

        <div className="bg-white rounded-b-xl shadow-lg p-8">
          {forced && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-lg mb-4">
              You must choose a new password before continuing. The temporary
              password you were given will no longer work after this change.
            </div>
          )}

          <h2 className="text-xl font-bold text-gray-800 mb-1">
            {session?.user?.email ?? "Account"}
          </h2>
          <p className="text-sm text-gray-500 mb-6">Pick a password only you know.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-dhl-red focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-dhl-red focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-400">At least 8 characters.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-dhl-red focus:border-transparent"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-dhl-red text-sm px-3 py-2 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-dhl-red text-white py-2.5 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {loading ? "Saving..." : "Save new password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
