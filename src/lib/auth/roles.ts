import { createSupabaseServerClient } from "@/lib/supabase/server";
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

/**
 * Loads the current session's profile row. Every API route that performs
 * a privileged action (anything using the service-role client) MUST call
 * this first and check the role explicitly — RLS will not protect you
 * once you're on the service-role client.
 */
export async function getCurrentProfile(): Promise<Profile> {
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
