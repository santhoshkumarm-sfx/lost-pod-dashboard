import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types/domain";

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const AUTH_DISABLED = process.env.AUTH_DISABLED === "true";

/**
 * Loads the current session's profile row. Every API route that performs
 * a privileged action (anything using the service-role client) MUST call
 * this first and check the role explicitly — RLS will not protect you
 * once you're on the service-role client.
 *
 * TEMPORARY PUBLIC ACCESS MODE (AUTH_DISABLED=true): there is no visitor
 * session to load, so every caller — including anonymous ones — is given
 * the same real profile named by AUTH_DISABLED_ACTOR_ID. This is what
 * every status change, Lost approval, and audit_log row gets attributed
 * to while this mode is on. Turning AUTH_DISABLED back to false (or
 * removing it) restores normal per-user login with no other code changes.
 * See README "Temporary public access" section before turning this on.
 */
export async function getCurrentProfile(): Promise<Profile> {
  if (AUTH_DISABLED) {
    const actorId = process.env.AUTH_DISABLED_ACTOR_ID;
    if (!actorId) {
      throw new Error(
        "AUTH_DISABLED is on but AUTH_DISABLED_ACTOR_ID is not set. Set it to the id of a real " +
          "row in public.profiles (select id, email from public.profiles where role = 'super_admin';)."
      );
    }
    // No session exists in this mode, so we read through the service-role
    // client directly rather than the (RLS-scoped, session-less) server client.
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.from("profiles").select("*").eq("id", actorId).single();
    if (error || !data) {
      throw new Error(
        `AUTH_DISABLED_ACTOR_ID (${actorId}) does not match any row in public.profiles.`
      );
    }
    if (!data.is_active) throw new ForbiddenError("The AUTH_DISABLED_ACTOR_ID account is deactivated.");
    return data as Profile;
  }

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) throw new UnauthorizedError("Profile not found");
  if (!data.is_active) throw new ForbiddenError("Your account has been deactivated");
  return data as Profile;
}

export function requireRole(profile: Profile, allowed: UserRole[]) {
  if (!allowed.includes(profile.role)) {
    throw new ForbiddenError(`This action requires one of: ${allowed.join(", ")}`);
  }
}

export const STAFF_ROLES: UserRole[] = ["super_admin", "admin", "internal_team"];
export const ADMIN_ROLES: UserRole[] = ["super_admin", "admin"];

export function isStaff(profile: Profile) {
  return STAFF_ROLES.includes(profile.role);
}
export function isAdmin(profile: Profile) {
  return ADMIN_ROLES.includes(profile.role);
}
