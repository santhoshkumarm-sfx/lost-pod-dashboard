import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";

const bodySchema = z.object({ reason: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const profile = await getCurrentProfile();
    const { reason } = bodySchema.parse(await req.json());

    // For a client_poc, additionally check the can_request_lost flag —
    // RLS lets them update their own client's cases generally, but this
    // business rule is enforced here rather than in Postgres so it can
    // be changed per-POC without a migration.
    if (profile.role === "client_poc") {
      const supabase = createSupabaseServerClient();
      const { data: poc } = await supabase
        .from("client_pocs")
        .select("can_request_lost")
        .eq("profile_id", profile.id)
        .single();
      if (!poc?.can_request_lost) {
        return NextResponse.json(
          { error: "Your account is not permitted to request Lost status." },
          { status: 403 }
        );
      }
    }

    // Runs with the caller's own session — request_lost_status() is
    // SECURITY INVOKER, so it is still subject to cases RLS underneath.
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("request_lost_status", {
      p_case_id: params.id,
      p_actor_id: profile.id,
      p_reason: reason || null,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ case: data });
  } catch (e: any) {
    const status = e.name === "UnauthorizedError" ? 401 : e.name === "ForbiddenError" ? 403 : 400;
    return NextResponse.json({ error: e.message ?? "Bad request" }, { status });
  }
}
