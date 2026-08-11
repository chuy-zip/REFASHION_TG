import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { listAssetUsage } from "@/lib/assets-server";
import { unauthorized } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/assets/:id/usage — which designs would be affected by deleting it.
 *
 * Read-only and RLS-filtered, so it can only ever report designs the caller may
 * already see. Feeds the warning in the delete dialog (§7.3): the decision to
 * delete stays with the user, the information does not.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  return NextResponse.json(await listAssetUsage(supabase, id));
}
