import { apiPost } from "@/lib/api-client";
import { extensionForMimeType, type AssetWithUrl } from "@/lib/assets";
import type {
  AssetOrigin,
  ClientAssetType,
  DesignAssetType,
} from "@/lib/types";

/**
 * The browser side of registering one image: presign -> PUT straight to R2 ->
 * confirm. Extracted here because several screens need it, and because the
 * three-step order is a rule worth having in exactly one place: an asset row
 * must never exist without its binary.
 *
 * Two entry points, mirroring `assets_owner_check`: an image can belong to a
 * client's catalog or to a design, never both. The binary itself is a `Blob`,
 * not a `File`, because a design asset usually never was a file — it comes out
 * of `canvas.toBlob()` in Módulo 1.
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

/** Whichever side of `assets_owner_check` this upload lands on. */
type Owner = { client_id: string } | { design_id: string };

export function validateUploadBlob(blob: Blob): string | null {
  if (
    !UPLOADABLE_MIME_TYPES.includes(
      blob.type as (typeof UPLOADABLE_MIME_TYPES)[number]
    )
  ) {
    return "Formato no soportado. Usa PNG, JPEG o WEBP.";
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    return "No se pudo subir la imagen. El archivo supera los 10 MB.";
  }
  return null;
}

interface UploadInput {
  owner: Owner;
  assetType: ClientAssetType | DesignAssetType;
  blob: Blob;
  /** File name without extension; the extension comes from the mime type. */
  baseName: string;
  origin: AssetOrigin;
  parentAssetId?: string | null;
}

async function upload({
  owner,
  assetType,
  blob,
  baseName,
  origin,
  parentAssetId,
}: UploadInput): Promise<UploadResult> {
  const invalid = validateUploadBlob(blob);
  if (invalid) return { ok: false, error: invalid };

  const presign = await apiPost<PresignResponse>("/api/assets/presign-upload", {
    ...owner,
    content_type: blob.type,
  });

  if (!presign.ok) return { ok: false, error: presign.error };

  const { upload_url, r2_key, asset_id } = presign.data;

  // The binary goes straight to R2, never through the API. This is the request
  // the bucket's CORS policy exists for (see SETUP_SUPABASE_R2.md §2.5).
  let putResponse: Response;
  try {
    putResponse = await fetch(upload_url, {
      method: "PUT",
      headers: { "Content-Type": blob.type },
      body: blob,
    });
  } catch {
    return {
      ok: false,
      error: "No se pudo subir la imagen. Revisa tu conexión.",
    };
  }

  if (!putResponse.ok) {
    return { ok: false, error: "No se pudo subir la imagen a almacenamiento." };
  }

  const confirm = await apiPost<AssetWithUrl>("/api/assets/confirm", {
    ...owner,
    asset_id,
    r2_key,
    asset_type: assetType,
    original_filename: `${baseName.trim()}.${extensionForMimeType(blob.type)}`,
    mime_type: blob.type,
    file_size_bytes: blob.size,
    origin,
    parent_asset_id: parentAssetId ?? null,
  });

  if (!confirm.ok) return { ok: false, error: confirm.error };

  return { ok: true, data: confirm.data };
}

/** A catalog image of a client: always uploaded by a person. */
export function uploadClientAsset(input: {
  clientId: string;
  assetType: ClientAssetType;
  file: File;
  baseName: string;
}): Promise<UploadResult> {
  return upload({
    owner: { client_id: input.clientId },
    assetType: input.assetType,
    blob: input.file,
    baseName: input.baseName,
    origin: "upload",
  });
}

/**
 * An image produced against a design.
 *
 * `parentAssetId` is not optional by accident: it is what sustains objetivo
 * específico 2 (linaje de iteración). Pass the image this one came out of.
 * `origin` defaults to `derived` because the caller that exists first is
 * Módulo 1's canvas export; a Runware result passes `generated`.
 */
export function uploadDesignAsset(input: {
  designId: string;
  assetType: DesignAssetType;
  blob: Blob;
  baseName: string;
  parentAssetId: string | null;
  origin?: AssetOrigin;
}): Promise<UploadResult> {
  return upload({
    owner: { design_id: input.designId },
    assetType: input.assetType,
    blob: input.blob,
    baseName: input.baseName,
    origin: input.origin ?? "derived",
    parentAssetId: input.parentAssetId,
  });
}
