import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import {
  discardObject,
  getDownloadUrl,
  getReadUrl,
  isAssetKeyForOwner,
} from "@/lib/r2";
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
    width_px,
    height_px,
    origin,
    parent_asset_id,
  } = parsed.data;

  /**
   * **The key has to be one this server handed out.**
   *
   * It arrives from the browser, and until this check it was taken on faith.
   * That allowed registering a row that points at another client's object and
   * then reading it through a signed URL, which is a disclosure rather than
   * untidiness — and it is also what made cleaning up after a failed confirm
   * impossible to do safely, since deleting a key the caller named would let
   * anyone destroy someone else's image.
   *
   * No round trip: the shape is decided by `presign-upload` from the same two
   * ids that arrive here, and RLS has already established that the caller may
   * write to this design or client (`lib/r2.ts`). The browser always sends back
   * exactly what presign returned, so nothing legitimate can fail here.
   */
  if (!isAssetKeyForOwner(r2_key, asset_id, { designId: design_id, clientId: client_id })) {
    return jsonError("La ubicación del archivo no es válida.", 400);
  }

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
      // El objeto ya está en R2 y esta petición es la única que sabe de él.
      // Se descarta acá porque la clave ya quedó verificada como del propio
      // dueño: sin esa verificación, esta línea sería un modo de borrarle
      // imágenes a otro cliente.
      await discardObject(r2_key);
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
      width_px: width_px ?? null,
      height_px: height_px ?? null,
      origin: origin ?? "upload",
      parent_asset_id: parent_asset_id ?? null,
    })
    .select()
    .single();

  if (error) {
    // Lo mismo que en las rutas de generación, con una excepción que importa:
    // **un 23505 no se limpia.** Ese código significa que ya existe una fila
    // con este `asset_id`, o sea que esta subida ya se registró antes; el
    // objeto que está en R2 es el de esa fila, y borrarlo dejaría rota a una
    // fila que funcionaba.
    if (error.code !== "23505") await discardObject(r2_key);
    return translateDbError(error);
  }

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
