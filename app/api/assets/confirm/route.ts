import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getDownloadUrl, getReadUrl } from "@/lib/r2";
import { confirmAssetSchema } from "@/lib/validation";
import {
  jsonError,
  readJsonBody,
  translateDbError,
  unauthorized,
} from "@/lib/api";
import type { Asset } from "@/lib/types";

/**
 * POST /api/assets/confirm — registers the asset row once the browser's PUT to
 * R2 succeeded. Unlike presign-upload, this is a real INSERT, so RLS enforces
 * can_edit_client the normal way (a rejection surfaces as 42501 -> 403).
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = confirmAssetSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const {
    asset_id,
    client_id,
    r2_key,
    asset_type,
    original_filename,
    mime_type,
    file_size_bytes,
  } = parsed.data;
  const supabase = await createSupabaseClient();

  const { data, error } = await supabase
    .from("assets")
    .insert({
      id: asset_id,
      client_id,
      r2_key,
      asset_type,
      original_filename,
      mime_type,
      file_size_bytes,
      origin: "upload",
    })
    .select()
    .single();

  if (error) return translateDbError(error);

  const created = data as Asset;
  const [url, downloadUrl] = await Promise.all([
    getReadUrl(created.r2_key),
    getDownloadUrl(created.r2_key, created.original_filename ?? created.r2_key),
  ]);

  return NextResponse.json({ ...created, url, downloadUrl }, { status: 201 });
}
