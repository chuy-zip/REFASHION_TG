/**
 * Asset vocabulary and pure helpers, safe to import from the browser.
 *
 * Nothing here may import `lib/r2` (or anything else server-only): client
 * components import this file, and `lib/r2` reads R2 credentials. The queries
 * that sign URLs live in `lib/assets-server.ts` for exactly that reason.
 */

import type { Asset, ClientAssetType, DesignAssetType } from "@/lib/types";

/**
 * Order mirrors objetivo específico 1: prendas base, logotipos, fotos de modelo.
 *
 * `as const` so the Zod schemas in lib/validation.ts can build their enums from
 * this list instead of repeating it. One place adds a type, both agree.
 */
export const CLIENT_ASSET_TYPES = [
  "base_garment",
  "logo",
  "model_photo",
  "tech_drawing",
] as const satisfies readonly ClientAssetType[];

/** Produced against a design, never uploaded to a catalog. Same `as const` reason. */
export const DESIGN_ASSET_TYPES = [
  "composition",
  "mask",
  "inpainting",
  "edit",
  "vton",
  "ai_model",
  "export_flat",
  "export_model",
  "export_ai",
] as const satisfies readonly DesignAssetType[];

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

/**
 * Spanish copy for the nine design-level types. They had none until now
 * because nothing produced them; `assetTypeLabel` fell through to printing the
 * raw English column value.
 *
 * The vocabulary is fixed across the app: "Máscara", "Prueba virtual". Where the
 * vocabulary has no word (the three exports) the label says what it is *for*, since
 * the three differ only by presentation (objetivo específico 3).
 */
export const DESIGN_ASSET_TYPE_COPY: Record<
  DesignAssetType,
  { label: string; labelPlural: string }
> = {
  composition: { label: "Composición", labelPlural: "Composiciones" },
  mask: { label: "Máscara", labelPlural: "Máscaras" },
  inpainting: { label: "Edición por zonas", labelPlural: "Ediciones por zonas" },
  // Paired against "por zonas" on purpose: the two labels say the difference
  // the user actually experiences. One is painted on a region, the other is
  // asked for in words and the model chooses the region.
  edit: { label: "Edición por instrucción", labelPlural: "Ediciones por instrucción" },
  vton: { label: "Prueba virtual", labelPlural: "Pruebas virtuales" },
  ai_model: { label: "Modelo IA", labelPlural: "Modelos IA" },
  export_flat: { label: "Export · prenda plana", labelPlural: "Exports · prenda plana" },
  export_model: { label: "Export · sobre modelo", labelPlural: "Exports · sobre modelo" },
  export_ai: { label: "Export · modelo IA", labelPlural: "Exports · modelo IA" },
};

export function assetTypeLabel(assetType: string): string {
  return (
    ASSET_TYPE_COPY[assetType as ClientAssetType]?.label ??
    DESIGN_ASSET_TYPE_COPY[assetType as DesignAssetType]?.label ??
    assetType
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

/**
 * El nombre que alguien le puso, sin la extensión, o null si nadie lo nombró.
 *
 * Distinto de `assetDisplayName`, y la diferencia es el destino: aquel arma el
 * nombre del **archivo** que se descarga, así que siempre devuelve algo y
 * siempre con extensión. Este es para **leer en pantalla**, donde ".webp" no
 * aporta nada y donde no tener nombre es una respuesta válida: quien llama
 * decide con qué rellenar el hueco, que en la galería es el nombre del diseño.
 *
 * Desde que las generaciones guardan null en esa columna, un valor acá
 * significa que alguien la nombró a mano.
 */
export function assetTitle(
  asset: Pick<Asset, "original_filename">
): string | null {
  const nombre = asset.original_filename?.trim();
  return nombre ? stripExtension(nombre) : null;
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
