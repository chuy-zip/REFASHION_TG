import { apiPost } from "@/lib/api-client";
import { extensionForMimeType, type AssetWithUrl } from "@/lib/assets";
import type { ClientAssetType } from "@/lib/types";

/**
 * The browser side of uploading one catalog image: presign -> PUT straight to
 * R2 -> confirm. Extracted here because two screens need it (the client's
 * Recursos tab and the starting-point picker's "Subir nueva"), and because the
 * three-step order is a rule worth having in exactly one place: an asset row
 * must never exist without its binary.
 *
 * Returns the same discriminated result as `lib/api-client`, so callers branch
 * with `if (!result.ok)` instead of try/catch.
 */

/** Kept in sync with `uploadableMimeType` in lib/validation.ts. */
export const UPLOADABLE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** `accept` value for a file input restricted to what R2 will take. */
export const UPLOAD_ACCEPT = UPLOADABLE_MIME_TYPES.join(",");

export type UploadResult =
  | { ok: true; data: AssetWithUrl }
  | { ok: false; error: string };

interface PresignResponse {
  upload_url: string;
  r2_key: string;
  asset_id: string;
}

interface UploadClientAssetInput {
  clientId: string;
  assetType: ClientAssetType;
  file: File;
  /** File name without extension; the extension comes from the mime type. */
  baseName: string;
}

export function validateUploadFile(file: File): string | null {
  if (!UPLOADABLE_MIME_TYPES.includes(file.type as (typeof UPLOADABLE_MIME_TYPES)[number])) {
    return "Formato no soportado. Usa PNG, JPEG o WEBP.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "No se pudo subir la imagen. El archivo supera los 10 MB.";
  }
  return null;
}

export async function uploadClientAsset({
  clientId,
  assetType,
  file,
  baseName,
}: UploadClientAssetInput): Promise<UploadResult> {
  const invalid = validateUploadFile(file);
  if (invalid) return { ok: false, error: invalid };

  const presign = await apiPost<PresignResponse>(
    "/api/assets/presign-upload",
    { client_id: clientId, content_type: file.type }
  );

  if (!presign.ok) return { ok: false, error: presign.error };

  const { upload_url, r2_key, asset_id } = presign.data;

  // The binary goes straight to R2, never through the API. This is the request
  // the bucket's CORS policy exists for (see SETUP_SUPABASE_R2.md §2.5).
  let putResponse: Response;
  try {
    putResponse = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
  } catch {
    return { ok: false, error: "No se pudo subir la imagen. Revisa tu conexión." };
  }

  if (!putResponse.ok) {
    return { ok: false, error: "No se pudo subir la imagen a almacenamiento." };
  }

  const confirm = await apiPost<AssetWithUrl>("/api/assets/confirm", {
    asset_id,
    client_id: clientId,
    r2_key,
    asset_type: assetType,
    original_filename: `${baseName.trim()}.${extensionForMimeType(file.type)}`,
    mime_type: file.type,
    file_size_bytes: file.size,
  });

  if (!confirm.ok) return { ok: false, error: confirm.error };

  return { ok: true, data: confirm.data };
}
