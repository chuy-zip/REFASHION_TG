import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getReadUrl } from "@/lib/r2";
import {
  listProjectDesigns,
  resolveDesignImageAssetId,
  type DesignListOptions,
  type DesignWithPreview,
} from "@/lib/designs";
import type { Asset } from "@/lib/types";

/**
 * Design queries that sign R2 URLs. Split from `lib/designs.ts` for the same
 * reason as the assets pair: that file is imported by client components, and
 * `lib/r2` carries credentials.
 */

/**
 * The designs of a project, each with a preview of **how it looks**.
 *
 * Preview resolution, in order:
 *   1. the design's latest `composition` — the garment with its logos on it
 *   2. failing that, the working image (the clean garment)
 *
 * Only the preview follows the composition. `base_asset_id` of an iteration
 * still comes from `resolveDesignImageAssetId`, so what gets inherited stays a
 * clean garment (§7.7). Looking and inheriting are different questions.
 *
 * Two queries regardless of how many designs the project has, rather than one
 * per design.
 */
export async function listProjectDesignsWithPreview(
  supabase: SupabaseClient,
  projectId: string,
  options: DesignListOptions = {}
): Promise<{ designs: DesignWithPreview[]; total: number }> {
  const { designs, total } = await listProjectDesigns(
    supabase,
    projectId,
    options
  );
  if (designs.length === 0) return { designs: [], total };

  // One query answers two questions: which composition to show, and when the
  // design last produced anything. Newest first, so the first row seen for a
  // design is its latest of whatever kind. The type filter that used to live
  // here was dropped on purpose — a mask or an inpainting is activity too, and
  // filtering it out would have made the date wrong the day Módulo 2 lands.
  const { data: assetData } = await supabase
    .from("assets")
    .select("design_id, r2_key, asset_type, created_at")
    .in(
      "design_id",
      designs.map((design) => design.id)
    )
    .order("created_at", { ascending: false });

  const compositionKeyByDesign = new Map<string, string>();
  const lastAssetAtByDesign = new Map<string, string>();

  for (const row of (assetData ?? []) as Pick<
    Asset,
    "design_id" | "r2_key" | "asset_type" | "created_at"
  >[]) {
    if (!row.design_id) continue;

    if (!lastAssetAtByDesign.has(row.design_id)) {
      lastAssetAtByDesign.set(row.design_id, row.created_at);
    }

    if (
      row.asset_type === "composition" &&
      !compositionKeyByDesign.has(row.design_id)
    ) {
      compositionKeyByDesign.set(row.design_id, row.r2_key);
    }
  }

  // Only the designs with no composition need their working image looked up.
  const fallbackIds = designs
    .filter((design) => !compositionKeyByDesign.has(design.id))
    .map((design) => resolveDesignImageAssetId(design))
    .filter((id): id is string => id !== null);

  const fallbackKeyByAsset = new Map<string, string>();
  if (fallbackIds.length > 0) {
    const { data: assetData } = await supabase
      .from("assets")
      .select("id, r2_key")
      .in("id", fallbackIds);

    for (const row of (assetData ?? []) as Pick<Asset, "id" | "r2_key">[]) {
      fallbackKeyByAsset.set(row.id, row.r2_key);
    }
  }

  const withPreview = await Promise.all(
    designs.map(async (design) => {
      const workingId = resolveDesignImageAssetId(design);
      const key =
        compositionKeyByDesign.get(design.id) ??
        (workingId ? fallbackKeyByAsset.get(workingId) : undefined);

      const lastAssetAt = lastAssetAtByDesign.get(design.id);

      return {
        ...design,
        preview_url: key ? await getReadUrl(key) : null,
        last_activity:
          lastAssetAt && lastAssetAt > design.updated_at
            ? lastAssetAt
            : design.updated_at,
      };
    })
  );

  return { designs: withPreview, total };
}
