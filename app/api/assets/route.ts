import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { jsonError, unauthorized } from "@/lib/api";
import { listClientAssets } from "@/lib/assets-server";

/** GET /api/assets?client_id=... — catalog assets with presigned GET URLs. */
export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const clientId = new URL(request.url).searchParams.get("client_id");
  if (!clientId) {
    return jsonError("Falta el parámetro client_id.", 400);
  }

  const supabase = await createSupabaseClient();
  const { assets, error } = await listClientAssets(supabase, clientId);

  if (error) return jsonError("No se pudieron cargar los recursos.", 500);

  return NextResponse.json(assets);
}
