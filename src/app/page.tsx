import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/roles";

// Without this, Next.js can statically prerender this redirect at build
// time when AUTH_DISABLED=true (that code path never calls cookies(),
// which is normally what signals a page needs per-request rendering) —
// baking in whatever the build machine's redirect happened to resolve to,
// instead of re-checking on every real request.
export const dynamic = "force-dynamic";

export default async function RootPage() {
  let authenticated = true;
  try {
    await getCurrentProfile();
  } catch {
    authenticated = false;
  }
  redirect(authenticated ? "/dashboard" : "/login");
}
