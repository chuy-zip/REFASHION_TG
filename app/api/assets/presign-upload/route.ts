import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getClientAccess } from "@/lib/access";
import { extensionForMimeType } from "@/lib/assets";
import { resolveDesignPath } from "@/lib/designs";
import { getUploadUrl } from "@/lib/r2";
import { presignUploadSchema } from "@/lib/validation";
import { jsonError, readJsonBody, unauthorized } from "@/lib/api";

/**
 * POST /api/assets/presign-upload — asset_id + R2 key + a short-lived signed
 * PUT URL, for a catalog asset (`client_id`) or a design asset (`design_id`).
 *
 * Does not touch the database, so RLS never runs: this is the one place in the
 * API that checks can_edit_client by hand (R2 has no idea what client_members
 * is). For a design asset the client has to be resolved first, which is the
 * same walk the R2 key needs.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  const body = await readJsonBody(request);
  if (body === null) {
    return jsonError("El cuerpo de la petición no es JSON válido.", 400);
  }

  const parsed = presignUploadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Los datos enviados no son válidos.",
      400
    );
  }

  const { client_id, design_id, content_type } = parsed.data;
  const supabase = await createSupabaseClient();

  const asset_id = crypto.randomUUID();
  const extension = extensionForMimeType(content_type);

  // Which client authorises this upload, and where the object goes. The schema
  // guarantees exactly one of the two ids is present.
  let ownerClientId: string;
  let r2_key: string;

  if (design_id) {
    const path = await resolveDesignPath(supabase, design_id);
    if (!path) {
      return jsonError("El diseño no existe o no tienes acceso.", 404);
    }

    ownerClientId = path.clientId;
    r2_key = `clients/${path.clientId}/projects/${path.projectId}/designs/${design_id}/${asset_id}.${extension}`;
  } else {
    ownerClientId = client_id as string;
    r2_key = `clients/${ownerClientId}/catalog/${asset_id}.${extension}`;
  }

  const access = await getClientAccess(supabase, ownerClientId, user.id);
  if (!access.canEdit) {
    return jsonError("No tienes permisos para subir recursos a este cliente.", 403);
  }

  const upload_url = await getUploadUrl(r2_key, content_type);

  return NextResponse.json({ upload_url, r2_key, asset_id });
}
