import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireRole, ADMIN_ROLES } from "@/lib/auth/roles";
import type { Client, ClientPoc, Profile } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

async function addPoc(formData: FormData) {
  "use server";
  const actor = await getCurrentProfile();
  requireRole(actor, ADMIN_ROLES);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const clientId = String(formData.get("client_id") ?? "");
  const designation = String(formData.get("designation") ?? "").trim();
  const canRequestLost = formData.get("can_request_lost") === "on";
  const canViewInternal = formData.get("can_view_internal_remarks") === "on";

  if (!email || !fullName || !clientId) return;

  const admin = createSupabaseServiceRoleClient();
  const { data: created, error: createError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });

  let userId = created?.user?.id;
  if (createError || !userId) {
    const { data: fallbackUser, error: fallbackError } = await admin.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (fallbackError || !fallbackUser?.user) return;
    userId = fallbackUser.user.id;
  }

  await admin.from("profiles").insert({
    id: userId,
    full_name: fullName,
    email,
    role: "client_poc",
    client_id: clientId,
  });

  await admin.from("client_pocs").insert({
    profile_id: userId,
    client_id: clientId,
    designation: designation || null,
    can_request_lost: canRequestLost,
    can_view_internal_remarks: canViewInternal,
  });

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "POC_CREATED",
    entity_type: "client_poc",
    new_value: { email, client_id: clientId },
  });

  revalidatePath("/pocs");
}

async function togglePocActive(formData: FormData) {
  "use server";
  const actor = await getCurrentProfile();
  requireRole(actor, ADMIN_ROLES);
  const id = String(formData.get("id"));
  const profileId = String(formData.get("profile_id"));
  const active = formData.get("active") === "true";

  const admin = createSupabaseServiceRoleClient();
  await admin.from("client_pocs").update({ is_active: active }).eq("id", id);
  await admin.from("profiles").update({ is_active: active }).eq("id", profileId);
  revalidatePath("/pocs");
}

export default async function PocsPage() {
  const supabase = createSupabaseServerClient();

  const { data: clients } = await supabase.from("clients").select("*").eq("is_active", true).order("name").returns<Client[]>();
  const { data: pocs } = await supabase
    .from("client_pocs")
    .select("*, profiles:profile_id(full_name, email, is_active), clients:client_id(name)")
    .order("created_at", { ascending: false })
    .returns<(ClientPoc & { profiles: Pick<Profile, "full_name" | "email" | "is_active">; clients: { name: string } })[]>();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink-900">Client POCs</h1>

      <form action={addPoc} className="card p-4 grid grid-cols-2 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Full name</label>
          <input name="full_name" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Email</label>
          <input name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Client</label>
          <select name="client_id" required className="input">
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Designation</label>
          <input name="designation" className="input" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="can_request_lost" defaultChecked /> Can request Lost
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="can_view_internal_remarks" /> Can view internal remarks
        </label>
        <button className="btn-primary col-span-full md:col-span-1">Add POC</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Client</th>
              <th>Designation</th>
              <th>Can request Lost</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(pocs ?? []).map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.profiles?.full_name}</td>
                <td>{p.profiles?.email}</td>
                <td>{p.clients?.name}</td>
                <td>{p.designation || "—"}</td>
                <td>{p.can_request_lost ? "Yes" : "No"}</td>
                <td>{p.is_active ? "Active" : "Deactivated"}</td>
                <td>
                  <form action={togglePocActive}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="profile_id" value={p.profile_id} />
                    <input type="hidden" name="active" value={(!p.is_active).toString()} />
                    <button className="btn-secondary">{p.is_active ? "Deactivate" : "Activate"}</button>
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
