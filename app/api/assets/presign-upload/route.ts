import { NextResponse } from "next/server";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getClientAccess } from "@/lib/access";
import { extensionForMimeType } from "@/lib/assets";
import { getUploadUrl } from "@/lib/r2";
import { presignUploadSchema } from "@/lib/validation";
import { jsonError, readJsonBody, unauthorized } from "@/lib/api";

/**
 * POST /api/assets/presign-upload — asset_id + R2 key + a short-lived signed
 * PUT URL. Does not touch the database, so RLS never runs: this is the one
 * place in the API that checks can_edit_client by hand (R2 has no idea what
 * client_members is).
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

  const { client_id, content_type } = parsed.data;
  const supabase = await createSupabaseClient();

  const access = await getClientAccess(supabase, client_id, user.id);
  if (!access.canEdit) {
    return jsonError("No tienes permisos para subir recursos a este cliente.", 403);
  }

  const asset_id = crypto.randomUUID();
  const extension = extensionForMimeType(content_type);
  const r2_key = `clients/${client_id}/catalog/${asset_id}.${extension}`;

  const upload_url = await getUploadUrl(r2_key, content_type);

  return NextResponse.json({ upload_url, r2_key, asset_id });
}
