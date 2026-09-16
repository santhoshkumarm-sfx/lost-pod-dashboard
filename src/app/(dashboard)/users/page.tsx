import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireRole, ADMIN_ROLES } from "@/lib/auth/roles";
import type { Profile, UserRole } from "@/lib/types/domain";
import { ROLE_LABELS } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

const INTERNAL_ROLES: UserRole[] = ["internal_team", "admin", "super_admin"];

async function inviteInternalUser(formData: FormData) {
  "use server";
  const actor = await getCurrentProfile();
  requireRole(actor, ADMIN_ROLES);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "internal_team") as UserRole;

  if (!email || !fullName) return;
  // Only a super_admin can mint another super_admin.
  if (role === "super_admin" && actor.role !== "super_admin") {
    throw new Error("Only a Super Admin can create another Super Admin.");
  }

  // Service-role client: this is the one legitimate place we bypass RLS,
  // because provisioning auth.users requires the Admin API. The role
  // check above is what stands in for RLS here.
  const admin = createSupabaseServiceRoleClient();

  const tempPassword = randomUUID();
  const { data: created, error: createError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });

  if (createError || !created?.user) {
    // Fallback for local/dev environments without email sending configured.
    const { data: fallbackUser, error: fallbackError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (fallbackError || !fallbackUser?.user) return;
    await admin.from("profiles").insert({
      id: fallbackUser.user.id,
      full_name: fullName,
      email,
      role,
    });
  } else {
    await admin.from("profiles").insert({
      id: created.user.id,
      full_name: fullName,
      email,
      role,
    });
  }

  const supabase = createSupabaseServerClient();
  await supabase.from("audit_logs").insert({
    actor_id: actor.id,
    action: "USER_CREATED",
    entity_type: "profile",
    new_value: { email, role },
  });

  revalidatePath("/users");
}

async function setUserActive(formData: FormData) {
  "use server";
  const actor = await getCurrentProfile();
  requireRole(actor, ADMIN_ROLES);
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";

  const admin = createSupabaseServiceRoleClient();
  await admin.from("profiles").update({ is_active: active }).eq("id", id);
  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entity_type: "profile",
    entity_id: id,
  });
  revalidatePath("/users");
}

async function changeUserRole(formData: FormData) {
  "use server";
  const actor = await getCurrentProfile();
  requireRole(actor, ADMIN_ROLES);
  const id = String(formData.get("id"));
  const role = String(formData.get("role")) as UserRole;

  if (role === "super_admin" && actor.role !== "super_admin") {
    throw new Error("Only a Super Admin can grant Super Admin.");
  }
  if (role === "client_poc") {
    throw new Error("Use the POCs page to convert a user into a client POC (it needs a client assignment).");
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: before } = await admin.from("profiles").select("role").eq("id", id).single();
  await admin.from("profiles").update({ role }).eq("id", id);
  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "ROLE_CHANGED",
    entity_type: "profile",
    entity_id: id,
    old_value: before,
    new_value: { role },
  });
  revalidatePath("/users");
}

export default async function UsersPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Profile[]>();

  const users = data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink-900">Users</h1>
      <p className="text-sm text-ink-600">
        Internal staff and client POC accounts. To create a POC, use the{" "}
        <a href="/pocs" className="text-brand-600 hover:underline">
          POCs
        </a>{" "}
        page instead, so they get linked to a client.
      </p>

      <form action={inviteInternalUser} className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Full name</label>
          <input name="full_name" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Email</label>
          <input name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-600 mb-1">Role</label>
          <select name="role" className="input" defaultValue="internal_team">
            {INTERNAL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary">Invite user</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.full_name}</td>
                <td>{u.email}</td>
                <td>
                  {u.role === "client_poc" ? (
                    ROLE_LABELS[u.role]
                  ) : (
                    <form action={changeUserRole} className="inline-flex items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} className="input py-1 text-xs">
                        {INTERNAL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                      <button className="btn-secondary py-1 text-xs">Save</button>
                    </form>
                  )}
                </td>
                <td>{u.is_active ? "Active" : "Deactivated"}</td>
                <td>
                  <form action={setUserActive}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="active" value={(!u.is_active).toString()} />
                    <button className="btn-secondary">{u.is_active ? "Deactivate" : "Activate"}</button>
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
