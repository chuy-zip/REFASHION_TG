import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getDownloadUrl, getReadUrl } from "@/lib/r2";
import { parentAssetBelongsToClient } from "@/lib/assets-server";
import { resolveDesignPath } from "@/lib/designs";
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
 * can_edit_client the normal way (a rejection surfaces as 42501 -> 403), for
 * both the client_id and the design_id branch: the policies in migration 002
 * already resolve the owning client either way.
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
    design_id,
    r2_key,
    asset_type,
    original_filename,
    mime_type,
    file_size_bytes,
    origin,
    parent_asset_id,
  } = parsed.data;
  const supabase = await createSupabaseClient();

  // Only paid for when a parent is actually claimed, which keeps the plain
  // upload path at one round trip.
  if (parent_asset_id) {
    let ownerClientId: string | null = client_id ?? null;
    if (!ownerClientId && design_id) {
      ownerClientId =
        (await resolveDesignPath(supabase, design_id))?.clientId ?? null;
    }

    const allowed =
      ownerClientId !== null &&
      (await parentAssetBelongsToClient(
        supabase,
        parent_asset_id,
        ownerClientId
      ));

    if (!allowed) {
      return jsonError(
        "El recurso de origen no pertenece a este cliente.",
        403
      );
    }
  }

  const { data, error } = await supabase
    .from("assets")
    .insert({
      id: asset_id,
      client_id: client_id ?? null,
      design_id: design_id ?? null,
      r2_key,
      asset_type,
      original_filename,
      mime_type,
      file_size_bytes,
      origin: origin ?? "upload",
      parent_asset_id: parent_asset_id ?? null,
    })
    .select()
    .single();

  if (error) return translateDbError(error);

  const created = data as Asset;

  // A design stops being a draft the moment it has something of its own. Only
  // from 'draft': 'completed' records a decision the user made and nothing
  // automatic may undo it (see APRENDIZAJES §3.9). Best-effort on purpose — the
  // asset is already registered, and a failure here must not undo that.
  if (design_id) {
    const { error: statusError } = await supabase
      .from("designs")
      .update({ status: "active" })
      .eq("id", design_id)
      .eq("status", "draft");

    if (statusError) {
      console.error(
        `Failed to advance design ${design_id} to 'active':`,
        statusError.message
      );
    }
  }

  const [url, downloadUrl] = await Promise.all([
    getReadUrl(created.r2_key),
    getDownloadUrl(created.r2_key, created.original_filename ?? created.r2_key),
  ]);

  return NextResponse.json({ ...created, url, downloadUrl }, { status: 201 });
}
