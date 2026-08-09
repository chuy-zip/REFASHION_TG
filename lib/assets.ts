/**
 * Asset vocabulary and pure helpers, safe to import from the browser.
 *
 * Nothing here may import `lib/r2` (or anything else server-only): client
 * components import this file, and `lib/r2` reads R2 credentials. The queries
 * that sign URLs live in `lib/assets-server.ts` for exactly that reason.
 */

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
