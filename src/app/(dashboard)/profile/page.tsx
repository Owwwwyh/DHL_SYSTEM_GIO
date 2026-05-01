"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import StatusBadge from "@/components/StatusBadge";

interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
}

export default function ProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);

  // Name form
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((p) => {
        setProfile(p);
        setName(p.name ?? "");
      });
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name cannot be empty"); return; }
    setSavingName(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setSavingName(false);
    if (res.ok) {
      setProfile(data);
      toast.success("Profile updated successfully");
    } else {
      toast.error(data.error ?? "Failed to update profile");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (!currentPw) { setPwError("Current password is required"); return; }
    if (newPw.length < 8) { setPwError("New password must be at least 8 characters"); return; }
    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }

    setSavingPw(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    const data = await res.json();
    setSavingPw(false);

    if (res.ok) {
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      toast.success("Password changed successfully");
    } else {
      setPwError(data.error ?? "Failed to change password");
    }
  }

  if (!profile) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-gray-500 mt-1">Manage your account details and security settings.</p>
      </div>

      <div className="max-w-lg space-y-6">
        {/* Personal Info */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Personal Information</h2>

          <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-dhl-red text-white flex items-center justify-center font-bold text-sm">
              {(profile.name ?? profile.email)[0].toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-gray-900">{profile.name ?? "—"}</p>
              <p className="text-xs text-gray-400">{profile.email}</p>
            </div>
            <div className="ml-auto">
              <StatusBadge status={profile.role} />
            </div>
          </div>

          <form onSubmit={saveName} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input value={profile.email} readOnly
                className="w-full px-3 py-2 border border-gray-100 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
              <p className="text-xs text-gray-400 mt-1">Contact an admin to change your email address.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <div className="flex items-center gap-2 px-3 py-2 border border-gray-100 rounded-lg bg-gray-50">
                <StatusBadge status={profile.role} />
                <span className="text-xs text-gray-400">Contact an admin to change your role.</span>
              </div>
            </div>
            <button type="submit" disabled={savingName}
              className="bg-dhl-red text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
              {savingName ? "Saving..." : "Update Profile"}
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Change Password</h2>
          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type={showPw ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
                placeholder="Enter your current password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
                placeholder="Minimum 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input
                type={showPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-dhl-red"
                placeholder="Re-enter new password"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} className="accent-dhl-red" />
              Show passwords
            </label>
            {pwError && (
              <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg border border-red-200">
                {pwError}
              </div>
            )}
            <button type="submit" disabled={savingPw}
              className="bg-dhl-red text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
              {savingPw ? "Changing..." : "Change Password"}
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-400 text-center">
          Member since {new Date(profile.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>
    </div>
  );
}
