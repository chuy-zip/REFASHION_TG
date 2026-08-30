import { apiPost } from "@/lib/api-client";
import { extensionForMimeType, type AssetWithUrl } from "@/lib/assets";
import { SVG_MIME_TYPE, isSvgFile, rasterizeSvgToPng } from "@/lib/svg-raster";
import { measureImageBlob } from "@/lib/image-size";
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

/**
 * What the file picker offers, which is **not** the same list as what gets
 * stored: an SVG is accepted and converted to PNG before it leaves the browser
 * (see `lib/svg-raster.ts`).
 *
 * Vectors only for logos. A base garment or a model photo comes out of a
 * camera, so SVG adds nothing there and the narrower list keeps the conversion
 * path down to the one case that needs it.
 */
export function uploadAcceptFor(assetType: ClientAssetType): string {
  return assetType === "logo"
    ? [...UPLOADABLE_MIME_TYPES, SVG_MIME_TYPE].join(",")
    : UPLOAD_ACCEPT;
}

/**
 * The extension the file will end up with, which the upload dialogs show
 * before uploading. An SVG becomes a PNG, so asking the mime type directly
 * would either throw or promise a `.svg` that never gets written.
 */
export function storedExtensionFor(file: File): string {
  return isSvgFile(file) ? "png" : extensionForMimeType(file.type);
}

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

  // Measured here and not on the server: the browser is about to decode this
  // image anyway, while the server would have to download it back from R2.
  // Módulo 2 cannot build a request without these two numbers (migration 016).
  // A blob we cannot decode simply arrives unmeasured — null is a legitimate
  // value and it must not fail an upload that already succeeded.
  const size = await measureImageBlob(blob);

  const confirm = await apiPost<AssetWithUrl>("/api/assets/confirm", {
    ...owner,
    asset_id,
    r2_key,
    asset_type: assetType,
    original_filename: `${baseName.trim()}.${extensionForMimeType(blob.type)}`,
    mime_type: blob.type,
    file_size_bytes: blob.size,
    width_px: size?.width ?? null,
    height_px: size?.height ?? null,
    origin,
    parent_asset_id: parentAssetId ?? null,
  });

  if (!confirm.ok) return { ok: false, error: confirm.error };

  return { ok: true, data: confirm.data };
}

/**
 * A catalog image of a client: always uploaded by a person.
 *
 * An SVG logo is rasterised here, before anything is presigned, so that the
 * whole system downstream keeps its invariant: **every object in R2 is a raster
 * the canvas can draw**. Nothing in the API, the schema or the canvas learned
 * about vectors, and the background removal of paso 4 needs no special case —
 * a converted logo with a white rectangle behind it floods exactly like a JPEG,
 * and one that was transparent arrives with its alpha intact.
 *
 * `origin` stays `upload`: a person uploaded this image and the format was
 * normalised. `derived` is for an image obtained *from another asset*, which
 * would need a parent that does not exist here.
 */
export async function uploadClientAsset(input: {
  clientId: string;
  assetType: ClientAssetType;
  file: File;
  baseName: string;
}): Promise<UploadResult> {
  let blob: Blob = input.file;

  if (isSvgFile(input.file)) {
    if (input.assetType !== "logo") {
      return {
        ok: false,
        error: "Solo los logotipos pueden subirse en SVG. Usa PNG, JPEG o WEBP.",
      };
    }

    // Checked against the source file too: the PNG that comes out of a heavy
    // SVG can be smaller than the markup that produced it, so the limit would
    // otherwise be enforced on the wrong thing.
    if (input.file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: "No se pudo subir la imagen. El archivo supera los 10 MB.",
      };
    }

    const raster = await rasterizeSvgToPng(input.file);
    if (!raster.ok) return { ok: false, error: raster.error };
    blob = raster.blob;
  }

  return upload({
    owner: { client_id: input.clientId },
    assetType: input.assetType,
    blob,
    baseName: input.baseName,
    origin: "upload",
  });
}

/**
 * A catalog image obtained from another one by a reproducible transformation:
 * today, a logo with its background removed (Módulo 1, paso 4).
 *
 * Separate from `uploadClientAsset` rather than an extra flag on it, because
 * the two differ in what they *require*, not in an option: this one cannot be
 * called without saying which image it came from. That is `origin = 'derived'`
 * as migration 012 defined it, and it is what keeps `generated` meaning "cost
 * money and came out of a model" (FASE_1_5 §3.1).
 *
 * The result is a new asset. The original is never overwritten: it may be
 * placed on other designs, and a `.jpg` key holding a PNG would be a lie.
 */
export function uploadDerivedClientAsset(input: {
  clientId: string;
  assetType: ClientAssetType;
  blob: Blob;
  baseName: string;
  parentAssetId: string;
}): Promise<UploadResult> {
  return upload({
    owner: { client_id: input.clientId },
    assetType: input.assetType,
    blob: input.blob,
    baseName: input.baseName,
    origin: "derived",
    parentAssetId: input.parentAssetId,
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
