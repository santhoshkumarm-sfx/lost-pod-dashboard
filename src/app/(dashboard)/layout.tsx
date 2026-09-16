import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, AUTH_DISABLED } from "@/lib/auth/roles";
import type { Profile } from "@/lib/types/domain";
import { ROLE_LABELS } from "@/lib/types/domain";
import { SignOutButton } from "@/components/SignOutButton";

// Applies to every page under this layout: without it, a page with no
// data-fetching of its own (the Phase 2/3/6/7 stub pages) can get
// statically prerendered in AUTH_DISABLED mode, baking in this layout's
// redirect/profile check at build time instead of per request.
export const dynamic = "force-dynamic";

const NAV_ITEMS: {
  href: string;
  label: string;
  roles: Profile["role"][];
}[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["super_admin", "admin", "internal_team", "client_poc"] },
  { href: "/cases", label: "Cases", roles: ["super_admin", "admin", "internal_team", "client_poc"] },
  { href: "/email-escalations", label: "Email Escalations", roles: ["super_admin", "admin", "internal_team"] },
  { href: "/sheet-imports", label: "Google Sheet Imports", roles: ["super_admin", "admin", "internal_team"] },
  { href: "/lost-approval", label: "Lost Approval", roles: ["super_admin", "admin"] },
  { href: "/lost-shipments", label: "Lost Shipments", roles: ["super_admin", "admin", "internal_team"] },
  { href: "/clients", label: "Clients", roles: ["super_admin", "admin"] },
  { href: "/pocs", label: "POCs", roles: ["super_admin", "admin"] },
  { href: "/users", label: "Users", roles: ["super_admin", "admin"] },
  { href: "/reports", label: "Reports", roles: ["super_admin", "admin"] },
  { href: "/settings", label: "Settings", roles: ["super_admin", "admin"] },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let profile: Profile;
  try {
    profile = await getCurrentProfile();
  } catch {
    redirect("/login");
  }

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(profile.role));

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 bg-ink-950 text-slate-200 flex flex-col">
        <div className="px-4 py-4 border-b border-white/10">
          <div className="text-white font-semibold text-sm leading-tight">Lost Shipment /</div>
          <div className="text-white font-semibold text-sm leading-tight">POD Dashboard</div>
        </div>
        <nav className="flex-1 py-3 space-y-0.5">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2 text-sm rounded-none hover:bg-white/10 text-slate-300 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-white/10 text-xs text-slate-400">
          Signed in as
          <div className="text-white text-sm truncate">{profile.full_name}</div>
          <div className="truncate">{ROLE_LABELS[profile.role]}</div>
          {!AUTH_DISABLED && <SignOutButton />}
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-slate-50">
        <div className="max-w-[1400px] mx-auto p-6">
          {AUTH_DISABLED && (
            <div className="mb-4 text-sm text-amber-900 bg-amber-100 border border-amber-300 rounded-md px-4 py-2">
              <strong>Public access mode is on</strong> — login is disabled and anyone with this
              URL has full Admin access. Set <code>AUTH_DISABLED=false</code> in your environment
              variables once real accounts are ready.
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
