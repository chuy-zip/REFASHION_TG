import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getReadUrl } from "@/lib/r2";
import {
  listProjectDesigns,
  resolveDesignImageAssetId,
  PROJECT_SAMPLE_SIZE,
  type DesignListOptions,
  type DesignWithPreview,
  type ProjectSamples,
} from "@/lib/designs";
import type { Asset, Design } from "@/lib/types";

/**
 * Design queries that sign R2 URLs. Split from `lib/designs.ts` for the same
 * reason as the assets pair: that file is imported by client components, and
 * `lib/r2` carries credentials.
 */

/** One row of `design_activity` (migration 014). */
interface DesignActivity {
  design_id: string;
  latest_composition_key: string | null;
  last_asset_at: string | null;
  asset_count: number;
}

/** The two columns `resolveDesignImageAssetId` needs, plus an identity. */
type PreviewableDesign = Pick<
  Design,
  "id" | "base_asset_id" | "current_asset_id"
>;

/**
 * What each design last produced, one row per design.
 *
 * Reads the `design_activity` view instead of the `assets` table: asking
 * Postgres for "the newest asset of each design" is one row per design, while
 * asking for every asset and keeping the first of each was one row per asset.
 */
async function fetchDesignActivity(
  supabase: SupabaseClient,
  designIds: string[]
): Promise<Map<string, DesignActivity>> {
  const byDesign = new Map<string, DesignActivity>();
  if (designIds.length === 0) return byDesign;

  const { data, error } = await supabase
    .from("design_activity")
    .select("design_id, latest_composition_key, last_asset_at, asset_count")
    .in("design_id", designIds);

  // A failure here is invisible in the UI: every design simply loses its
  // preview, which looks like "these designs have no image" rather than like a
  // broken query. Worth a line in the terminal.
  if (error && process.env.NODE_ENV === "development") {
    console.error("[design_activity] no se pudo leer:", {
      message: error.message,
      code: error.code,
      hint: error.hint,
    });
  }

  for (const row of (data ?? []) as DesignActivity[]) {
    byDesign.set(row.design_id, row);
  }

  return byDesign;
}

/**
 * A signed URL of **how each design looks**, keyed by design id.
 *
 * Resolution order:
 *   1. the design's latest `composition` — the garment with its logos on it
 *   2. failing that, the working image (the clean garment)
 *
 * Only the preview follows the composition. `base_asset_id` of an iteration
 * still comes from `resolveDesignImageAssetId`, so what gets inherited stays a
 * clean garment. Looking and inheriting are different questions.
 *
 * Shared by the design list and the project samples, so that rule is written
 * once. A design missing from the returned map simply has no image yet.
 */
async function resolvePreviewUrls(
  supabase: SupabaseClient,
  designs: PreviewableDesign[],
  activity: Map<string, DesignActivity>
): Promise<Map<string, string>> {
  // Only the designs with no composition need their working image looked up.
  const fallbackIds = designs
    .filter((design) => !activity.get(design.id)?.latest_composition_key)
    .map((design) => resolveDesignImageAssetId(design))
    .filter((id): id is string => id !== null);

  const keyByAsset = new Map<string, string>();
  if (fallbackIds.length > 0) {
    const { data } = await supabase
      .from("assets")
      .select("id, r2_key")
      .in("id", fallbackIds);

    for (const row of (data ?? []) as Pick<Asset, "id" | "r2_key">[]) {
      keyByAsset.set(row.id, row.r2_key);
    }
  }

  const urlByDesign = new Map<string, string>();
  await Promise.all(
    designs.map(async (design) => {
      const workingId = resolveDesignImageAssetId(design);
      const key =
        activity.get(design.id)?.latest_composition_key ??
        (workingId ? keyByAsset.get(workingId) : undefined);

      if (key) urlByDesign.set(design.id, await getReadUrl(key));
    })
  );

  return urlByDesign;
}

/**
 * The designs of a project, each with a preview and a last-activity date.
 *
 * Three queries regardless of how many designs the project has, and every one
 * of them bounded by the page: the page size is also the image budget.
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

  const activity = await fetchDesignActivity(
    supabase,
    designs.map((design) => design.id)
  );
  const previews = await resolvePreviewUrls(supabase, designs, activity);

  return {
    designs: designs.map((design) => {
      const lastAssetAt = activity.get(design.id)?.last_asset_at;

      return {
        ...design,
        preview_url: previews.get(design.id) ?? null,
        asset_count: activity.get(design.id)?.asset_count ?? 0,
        last_activity:
          lastAssetAt && lastAssetAt > design.updated_at
            ? lastAssetAt
            : design.updated_at,
      };
    }),
    total,
  };
}

/**
 * "La muestra" for a set of projects: up to `PROJECT_SAMPLE_SIZE` of each
 * project's most recent designs, with an image each.
 *
 * **The cap is applied by Postgres, not here.** `project_design_samples`
 * numbers each project's designs by recency and the query keeps
 * `position <= 4`, so the rows that will not be shown are never sent and never
 * turn into a signed URL. Trimming in JavaScript would mean the server had
 * already resolved images nobody would see, which is the whole cost.
 *
 * `design_count` rides along from the same view (a window count over the full
 * partition), so a card can say "5 diseños" while showing four without a second
 * query.
 *
 * Four sampled designs each, so the images on screen are bounded by
 * `projects.length * PROJECT_SAMPLE_SIZE` — and the caller pages the projects.
 */
export async function fetchProjectSamples(
  supabase: SupabaseClient,
  projectIds: string[]
): Promise<Map<string, ProjectSamples>> {
  const byProject = new Map<string, ProjectSamples>();
  if (projectIds.length === 0) return byProject;

  const { data, error } = await supabase
    .from("project_design_samples")
    .select(
      "project_id, design_id, name, base_asset_id, current_asset_id, position, design_count"
    )
    .in("project_id", projectIds)
    .lte("position", PROJECT_SAMPLE_SIZE)
    .order("position", { ascending: true });

  if (error && process.env.NODE_ENV === "development") {
    console.error("[project_design_samples] no se pudo leer:", {
      message: error.message,
      code: error.code,
      hint: error.hint,
    });
  }

  const rows = (data ?? []) as {
    project_id: string;
    design_id: string;
    name: string;
    base_asset_id: string | null;
    current_asset_id: string | null;
    design_count: number;
  }[];

  if (rows.length === 0) return byProject;

  const sampled: PreviewableDesign[] = rows.map((row) => ({
    id: row.design_id,
    base_asset_id: row.base_asset_id,
    current_asset_id: row.current_asset_id,
  }));

  const activity = await fetchDesignActivity(
    supabase,
    sampled.map((design) => design.id)
  );
  const previews = await resolvePreviewUrls(supabase, sampled, activity);

  for (const row of rows) {
    const entry = byProject.get(row.project_id) ?? {
      design_count: row.design_count,
      samples: [],
    };

    entry.samples.push({
      design_id: row.design_id,
      name: row.name,
      preview_url: previews.get(row.design_id) ?? null,
    });

    byProject.set(row.project_id, entry);
  }

  return byProject;
}
