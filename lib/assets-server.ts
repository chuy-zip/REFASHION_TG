import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDownloadUrl, getReadUrl } from "@/lib/r2";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import type { Asset } from "@/lib/types";

/**
 * Asset queries that sign R2 URLs. Split out of `lib/assets.ts` because that
 * file is imported by client components: pulling `lib/r2` (and the AWS SDK)
 * into their import graph only worked by grace of tree-shaking. The
 * `server-only` import above turns that from a hope into a build error.
 */

async function withUrls(rows: Asset[]): Promise<AssetWithUrl[]> {
  return Promise.all(
    rows.map(async (asset) => ({
      ...asset,
      url: await getReadUrl(asset.r2_key),
      downloadUrl: await getDownloadUrl(asset.r2_key, assetDisplayName(asset)),
    }))
  );
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

  return { assets: await withUrls(data as Asset[]), error: null };
}

/**
 * Assets produced against a design, **oldest first**.
 *
 * The order is deliberate and differs from the catalog's: this is the design's
 * history, and a history reads forward. It is the list the timeline will render
 * (FASE_1_5 §7.4), so the chronology has to be stable from the first day rather
 * than reversed later once something depends on it.
 */
export async function listDesignAssets(
  supabase: SupabaseClient,
  designId: string
): Promise<{ assets: AssetWithUrl[]; error: string | null }> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("design_id", designId)
    .order("created_at", { ascending: true });

  if (error) return { assets: [], error: error.message };

  return { assets: await withUrls(data as Asset[]), error: null };
}

/* -------------------------------------------------------------------------- */
/* Where an asset is used, for the delete warning (§7.3)                        */
/* -------------------------------------------------------------------------- */

/** One design that would be affected by deleting an asset. */
export interface AssetUsage {
  design_id: string;
  design_name: string;
  design_version: number;
  /** It is the design's starting or working image. */
  as_image: boolean;
  /** It is placed on the design as a logo layer. */
  as_layer: boolean;
}

/**
 * Which designs use an asset, and how.
 *
 * Feeds the warning before deleting a catalog image. §7.3 decided **warning,
 * not block**: the invariant "a client always has an owner" protects against a
 * broken state, but a design that loses an image degrades fine — the canvas
 * goes empty, which the UI already handles. Blocking would leave someone unable
 * to tidy their catalog because of a design from a project closed a year ago.
 *
 * Covers the two ways an asset gets used, not just logos: a garment can be a
 * design's starting image (`base_asset_id` / `current_asset_id`) and a logo can
 * be placed as a layer. Reporting only one of them would make the warning lie
 * by omission.
 */
export async function listAssetUsage(
  supabase: SupabaseClient,
  assetId: string
): Promise<AssetUsage[]> {
  // Two plain queries instead of an embedded resource: the embed comes back
  // typed as an array and shaped as an object, and this runs on a destructive
  // path where "returned nothing" must not be indistinguishable from "found
  // nothing".
  const [imageResult, layerResult] = await Promise.all([
    supabase
      .from("designs")
      .select("id, name, version")
      .or(`base_asset_id.eq.${assetId},current_asset_id.eq.${assetId}`),
    supabase.from("design_layers").select("design_id").eq("asset_id", assetId),
  ]);

  const layerDesignIds = [
    ...new Set(
      ((layerResult.data ?? []) as { design_id: string }[]).map(
        (row) => row.design_id
      )
    ),
  ];

  const layerDesigns =
    layerDesignIds.length === 0
      ? []
      : (
          (
            await supabase
              .from("designs")
              .select("id, name, version")
              .in("id", layerDesignIds)
          ).data ?? []
        ) as { id: string; name: string; version: number }[];

  const byDesign = new Map<string, AssetUsage>();

  const remember = (
    design: { id: string; name: string; version: number },
    how: "image" | "layer"
  ) => {
    const existing = byDesign.get(design.id) ?? {
      design_id: design.id,
      design_name: design.name,
      design_version: design.version,
      as_image: false,
      as_layer: false,
    };
    if (how === "image") existing.as_image = true;
    else existing.as_layer = true;
    byDesign.set(design.id, existing);
  };

  for (const row of (imageResult.data ?? []) as {
    id: string;
    name: string;
    version: number;
  }[]) {
    remember(row, "image");
  }

  // The same logo placed twice on one design is one affected design, not two:
  // the ids were de-duplicated above.
  for (const design of layerDesigns) {
    remember(design, "layer");
  }

  return [...byDesign.values()].sort((a, b) =>
    a.design_name.localeCompare(b.design_name)
  );
}

/* -------------------------------------------------------------------------- */
/* R2 cleanup: collecting keys before a cascade erases them                     */
/* -------------------------------------------------------------------------- */

/**
 * Postgres cascades happen inside the engine, as part of one DELETE, with no
 * hook for application code to learn which rows disappeared. Reading the keys
 * *before* the delete is the only chance to know what to clean up in R2
 * afterwards (APRENDIZAJES §3.10).
 *
 * Written as explicit steps instead of one query filtering through two levels
 * of embedded resources. A traversal that silently returns nothing would
 * recreate the exact bug these functions exist to fix, and would look correct
 * while doing it; these fail loudly or not at all.
 */

async function r2KeysOfDesigns(
  supabase: SupabaseClient,
  designIds: string[]
): Promise<string[]> {
  if (designIds.length === 0) return [];

  const { data } = await supabase
    .from("assets")
    .select("r2_key")
    .in("design_id", designIds);

  return (data ?? []).map((row) => (row as { r2_key: string }).r2_key);
}

async function designIdsOfProjects(
  supabase: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  if (projectIds.length === 0) return [];

  const { data } = await supabase
    .from("designs")
    .select("id")
    .in("project_id", projectIds);

  return (data ?? []).map((row) => (row as { id: string }).id);
}

export async function listR2KeysUnderDesign(
  supabase: SupabaseClient,
  designId: string
): Promise<string[]> {
  return r2KeysOfDesigns(supabase, [designId]);
}

export async function listR2KeysUnderProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<string[]> {
  const designIds = await designIdsOfProjects(supabase, [projectId]);
  return r2KeysOfDesigns(supabase, designIds);
}

/**
 * Everything under a client: its catalog **and** every design asset hanging off
 * its projects.
 *
 * The second half is what `DELETE /api/clients/:id` was missing. It collected
 * keys with `client_id = ?`, which only ever matches catalog assets — design
 * assets carry `client_id = null` and hang off `design_id`. Harmless while no
 * design asset existed; from now on it would silently orphan every composition
 * and export the client ever produced.
 */
export async function listR2KeysUnderClient(
  supabase: SupabaseClient,
  clientId: string
): Promise<string[]> {
  const { data: catalogData } = await supabase
    .from("assets")
    .select("r2_key")
    .eq("client_id", clientId);

  const catalogKeys = (catalogData ?? []).map(
    (row) => (row as { r2_key: string }).r2_key
  );

  const { data: projectData } = await supabase
    .from("projects")
    .select("id")
    .eq("client_id", clientId);

  const projectIds = (projectData ?? []).map(
    (row) => (row as { id: string }).id
  );
  const designIds = await designIdsOfProjects(supabase, projectIds);

  return [...catalogKeys, ...(await r2KeysOfDesigns(supabase, designIds))];
}
