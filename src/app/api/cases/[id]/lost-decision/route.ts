import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireRole, ADMIN_ROLES } from "@/lib/auth/roles";

const bodySchema = z.object({
  decision: z.enum(["approved", "rejected", "sent_back_for_investigation"]),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const profile = await getCurrentProfile();
    requireRole(profile, ADMIN_ROLES); // only Admin / Super Admin decide Lost approvals

    const { decision, reason } = bodySchema.parse(await req.json());

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("decide_lost_status", {
      p_case_id: params.id,
      p_actor_id: profile.id,
      p_decision: decision,
      p_reason: reason || null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ case: data });
  } catch (e: any) {
    const status = e.name === "UnauthorizedError" ? 401 : e.name === "ForbiddenError" ? 403 : 400;
    return NextResponse.json({ error: e.message ?? "Bad request" }, { status });
  }
}
