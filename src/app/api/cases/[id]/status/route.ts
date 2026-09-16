import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireRole, STAFF_ROLES } from "@/lib/auth/roles";

const bodySchema = z.object({
  status_code: z.enum([
    "PENDING",
    "WORKING_ON_IT",
    "SHIPMENT_AT_DC",
    "SHIPMENT_AT_HUB",
    "POD_SHARED",
    "CLOSED",
  ]),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const profile = await getCurrentProfile();
    requireRole(profile, STAFF_ROLES);

    const { status_code } = bodySchema.parse(await req.json());

    // Uses the caller's own session (RLS-scoped, not service-role) — an
    // internal_team member can only do what cases_staff_update allows.
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("cases")
      .update({ status_code })
      .eq("case_id", params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ case: data });
  } catch (e: any) {
    const status = e.name === "UnauthorizedError" ? 401 : e.name === "ForbiddenError" ? 403 : 400;
    return NextResponse.json({ error: e.message ?? "Bad request" }, { status });
  }
}
