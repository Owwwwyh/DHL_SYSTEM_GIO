import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string })?.role;
  if (role !== "admin") redirect("/");

  return (
    <div className="flex flex-col h-full">
      <div className="bg-gray-800 border-b border-gray-700 px-8 py-3 flex items-center gap-4 shrink-0 no-print">
        <span className="bg-dhl-red text-white text-xs font-black px-2 py-0.5 rounded">ADMIN</span>
        <nav className="flex items-center gap-1">
          <Link href="/admin/users" className="text-gray-300 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">
            👥 Users
          </Link>
        </nav>
        <Link href="/" className="ml-auto text-gray-400 hover:text-white text-xs transition-colors">
          ← Back to App
        </Link>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
