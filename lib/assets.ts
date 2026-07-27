import type { SupabaseClient } from "@supabase/supabase-js";
import { getDownloadUrl, getReadUrl } from "@/lib/r2";
import type { Asset, ClientAssetType } from "@/lib/types";

/** Order mirrors objetivo específico 1: prendas base, logotipos, fotos de modelo. */
export const CLIENT_ASSET_TYPES: ClientAssetType[] = [
  "base_garment",
  "logo",
  "model_photo",
  "tech_drawing",
];

export const ASSET_TYPE_COPY: Record<
  ClientAssetType,
  { label: string; labelPlural: string; empty: string }
> = {
  base_garment: {
    label: "Prenda base",
    labelPlural: "Prendas base",
    empty: "No hay prendas base aún.",
  },
  logo: {
    label: "Logotipo",
    labelPlural: "Logotipos",
    empty: "No hay logotipos aún.",
  },
  model_photo: {
    label: "Modelo",
    labelPlural: "Modelos",
    empty: "No hay fotos de modelo aún.",
  },
  tech_drawing: {
    label: "Dibujo técnico",
    labelPlural: "Dibujos técnicos",
    empty: "No hay dibujos técnicos aún.",
  },
};

export function assetTypeLabel(assetType: string): string {
  return (
    ASSET_TYPE_COPY[assetType as ClientAssetType]?.label ?? assetType
  );
}

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Must be called with a content_type validated by presignUploadSchema. */
export function extensionForMimeType(mimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[mimeType];
  if (!extension) throw new Error(`Unsupported mime type: ${mimeType}`);
  return extension;
}

/**
 * Strips the trailing extension so the UI can offer an editable "base name"
 * while the extension stays fixed (derived from the real mime type, never
 * from user input — see extensionForMimeType).
 */
export function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

/** Assets uploaded before migration 008 have no original_filename to show. */
export function assetDisplayName(asset: Pick<Asset, "asset_type" | "mime_type" | "original_filename">): string {
  if (asset.original_filename) return asset.original_filename;
  return `${assetTypeLabel(asset.asset_type)}.${extensionForMimeType(asset.mime_type)}`;
}

export function formatFileSize(bytes: number | null): string | null {
  if (!bytes) return null;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export interface AssetWithUrl extends Asset {
  /** Presigned GET URL for inline display (`<img>`), generated fresh on every read — never persisted. */
  url: string;
  /** Presigned GET URL that forces a download (Content-Disposition: attachment). */
  downloadUrl: string;
}

/**
 * Catalog assets of a client (client_id set, design_id null), newest first,
 * each with freshly-signed read/download URLs. RLS returns only what the user
 * may see.
 */
export async function listClientAssets(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ assets: AssetWithUrl[]; error: string | null }> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) return { assets: [], error: error.message };

  const assets = await Promise.all(
    (data as Asset[]).map(async (asset) => ({
      ...asset,
      url: await getReadUrl(asset.r2_key),
      downloadUrl: await getDownloadUrl(asset.r2_key, assetDisplayName(asset)),
    }))
  );

  return { assets, error: null };
}
