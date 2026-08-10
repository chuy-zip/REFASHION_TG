import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { jsonError, unauthorized } from "@/lib/api";
import { listClientAssets, listDesignAssets } from "@/lib/assets-server";

/**
 * GET /api/assets?client_id=... — catalog assets of a client.
 * GET /api/assets?design_id=... — assets produced against a design.
 *
 * Exactly one of the two, mirroring `assets_owner_check`. Both come back with
 * presigned GET URLs; RLS decides what is visible either way.
 */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;
  const clientId = params.get("client_id");
  const designId = params.get("design_id");

  if ((clientId === null) === (designId === null)) {
    return jsonError("Envía client_id o design_id, exactamente uno.", 400);
  }

  const supabase = await createSupabaseClient();
  const { assets, error } = designId
    ? await listDesignAssets(supabase, designId)
    : await listClientAssets(supabase, clientId as string);

  if (error) return jsonError("No se pudieron cargar los recursos.", 500);

  return NextResponse.json(assets);
}
