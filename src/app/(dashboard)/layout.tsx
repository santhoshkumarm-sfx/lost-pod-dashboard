import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/domain";
import { ROLE_LABELS } from "@/lib/types/domain";
import { SignOutButton } from "@/components/SignOutButton";

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
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile || !profile.is_active) redirect("/login");

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
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 bg-slate-50">
        <div className="max-w-[1400px] mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
