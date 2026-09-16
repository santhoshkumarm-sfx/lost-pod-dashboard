import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireRole, ADMIN_ROLES } from "@/lib/auth/roles";
import type { Client } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

async function createClient(formData: FormData) {
  "use server";
  const profile = await getCurrentProfile();
  requireRole(profile, ADMIN_ROLES);

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const slaDays = Number(formData.get("sla") ?? 7);
  if (!name) return;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("clients").insert({
    name,
    code: code || null,
    default_sla_days: slaDays,
  });

  if (!error) {
    await supabase.from("audit_logs").insert({
      actor_id: profile.id,
      action: "CLIENT_CREATED",
      entity_type: "client",
      new_value: { name, code },
    });
  }
  revalidatePath("/clients");
}

async function toggleActive(formData: FormData) {
  "use server";
  const profile = await getCurrentProfile();
  requireRole(profile, ADMIN_ROLES);
  const id = String(formData.get("id"));
  const nextActive = formData.get("active") === "true";

  const supabase = createSupabaseServerClient();
  await supabase.from("clients").update({ is_active: nextActive }).eq("id", id);
  revalidatePath("/clients");
}

export default async function ClientsPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.from("clients").select("*").order("name").returns<Client[]>();
  const clients = data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink-900">Clients</h1>

      <form action={createClient} className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Client name</label>
          <input name="name" required className="input" placeholder="e.g. Flipkart" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Code</label>
          <input name="code" className="input" placeholder="FLIPKART" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Default SLA (days)</label>
          <input name="sla" type="number" defaultValue={7} className="input w-24" />
        </div>
        <button className="btn-primary">Add client</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Default SLA</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.name}</td>
                <td>{c.code || "—"}</td>
                <td>{c.default_sla_days} days</td>
                <td>{c.is_active ? "Active" : "Inactive"}</td>
                <td>
                  <form action={toggleActive}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="active" value={(!c.is_active).toString()} />
                    <button className="btn-secondary">{c.is_active ? "Deactivate" : "Activate"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
