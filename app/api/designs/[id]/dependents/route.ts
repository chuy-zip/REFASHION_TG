import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { listDesignDependents } from "@/lib/assets-server";
import { unauthorized } from "@/lib/api";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/designs/:id/dependents — which other designs deleting it would harm.
 *
 * Read-only and RLS-filtered, so it can only ever report designs the caller may
 * already see. Feeds the warning in the delete dialog (§7.3): the decision to
 * delete stays with the user, the information does not.
 *
 * Mirrors `GET /api/assets/:id/usage` deliberately — same question one level
 * up, same answer shape, same place in the flow.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const supabase = await createSupabaseClient();

  return NextResponse.json(await listDesignDependents(supabase, id));
}
