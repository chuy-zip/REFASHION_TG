import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDownloadUrl, getReadUrl } from "@/lib/r2";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import { resolveDesignPath } from "@/lib/designs";
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

/**
 * Whether an asset may be recorded as another one's `parent_asset_id`.
 *
 * `parent_asset_id` is a foreign key writable from the API, and those are
 * verified below RLS (APRENDIZAJES §2.5b): the policy on the INSERT checks who
 * owns the row being written, never what that row points at. Without this,
 * `confirm` accepted any UUID, including an asset of another client, and the
 * column that carries objetivo específico 2 would record lineage that crosses
 * clients — invisible until someone reads the chain.
 *
 * Answers two questions in one query, because reading the parent goes through
 * RLS: can this user see it at all, and does it hang off the same client. A
 * parent that is itself a design asset resolves through its design.
 */
export async function parentAssetBelongsToClient(
  supabase: SupabaseClient,
  parentAssetId: string,
  clientId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("assets")
    .select("client_id, design_id")
    .eq("id", parentAssetId)
    .maybeSingle();

  const parent = data as {
    client_id: string | null;
    design_id: string | null;
  } | null;

  // Gone, or hidden by RLS. Both mean "not something you may point at".
  if (!parent) return false;

  if (parent.client_id) return parent.client_id === clientId;
  if (!parent.design_id) return false;

  const path = await resolveDesignPath(supabase, parent.design_id);
  return path?.clientId === clientId;
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

/** A design that would be damaged by deleting another one. */
export interface DesignDependent {
  design_id: string;
  design_name: string;
  design_version: number;
  /**
   * Its starting image is one of the doomed design's images, so deleting it
   * leaves this design with an empty canvas. This is the damaging half.
   */
  loses_image: boolean;
  /** It records the doomed design as the one it came from. */
  loses_lineage: boolean;
}

/**
 * Which designs a deletion would reach, beyond the one being deleted.
 *
 * **The delete dialog used to say the cascade stopped at the design. It does
 * not.** Creating design B from design A copies A's *current image id* into
 * B.base_asset_id — a snapshot, which is why A moving its cursor afterwards
 * never disturbs B (`app/api/designs/route.ts`). But that image is a row with
 * `design_id = A`, and `assets.design_id` cascades. So deleting A destroys the
 * image B starts from, and B is left with an empty canvas and, because
 * `parent_design_id` is `on delete set null`, no record of where it came from.
 *
 * Same criterion as `listAssetUsage`, and §7.3 decided it once: **warn, do not
 * block**. Someone tidying a project should not be stopped by an iteration made
 * months ago — but they should not find out afterwards either.
 *
 * The two halves are reported apart because they are not equally bad. Losing
 * the image empties a canvas; losing the lineage only loses a note about where
 * it came from. Collapsing them would make the warning sound the same in both
 * cases.
 */
export async function listDesignDependents(
  supabase: SupabaseClient,
  designId: string
): Promise<DesignDependent[]> {
  const { data: assetData } = await supabase
    .from("assets")
    .select("id")
    .eq("design_id", designId);

  const assetIds = ((assetData ?? []) as { id: string }[]).map((row) => row.id);

  // Two queries, not one `or`: PostgREST's `in.()` needs a non-empty list, and
  // a design with no images yet can still have children pointing at it.
  const [imageResult, lineageResult] = await Promise.all([
    assetIds.length === 0
      ? Promise.resolve({ data: [] })
      : supabase
          .from("designs")
          .select("id, name, version")
          .neq("id", designId)
          .or(
            `base_asset_id.in.(${assetIds.join(",")}),` +
              `current_asset_id.in.(${assetIds.join(",")})`
          ),
    supabase
      .from("designs")
      .select("id, name, version")
      .eq("parent_design_id", designId),
  ]);

  const byDesign = new Map<string, DesignDependent>();

  const remember = (
    design: { id: string; name: string; version: number },
    how: "image" | "lineage"
  ) => {
    const existing = byDesign.get(design.id) ?? {
      design_id: design.id,
      design_name: design.name,
      design_version: design.version,
      loses_image: false,
      loses_lineage: false,
    };

    if (how === "image") existing.loses_image = true;
    else existing.loses_lineage = true;

    byDesign.set(design.id, existing);
  };

  type Row = { id: string; name: string; version: number };
  for (const row of (imageResult.data ?? []) as Row[]) remember(row, "image");
  for (const row of (lineageResult.data ?? []) as Row[]) remember(row, "lineage");

  return [...byDesign.values()].sort((a, b) =>
    a.design_name.localeCompare(b.design_name, "es")
  );
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

/** A finished image a design produced, with the design it belongs to. */
export interface FinalProduct extends AssetWithUrl {
  design_id_of: string;
  design_name: string;
  design_version: number;
  project_name: string;
}

/**
 * What a client's designs have actually produced, across every project.
 *
 * **The gap this fills.** Deliverables are stored on the design that made them,
 * which is right — they belong to it, and the lineage stays intact. But it also
 * means the only way to reach one is to remember which design it came out of,
 * and after a few projects nobody does. The question "what have we finished for
 * this client?" had no place that answered it.
 *
 * Deliberately NOT solved by copying them into the catalog. That would put the
 * same file in two places and force a rule for what happens when one is
 * deleted; the images are already stored once and this reads them where they
 * are.
 *
 * `composition` counts because it is the deliverable that exists today: the
 * garment with its logos, which is what the client is buying. The three
 * `export_*` types are the three presentations of objetivo específico 3 and are
 * listed here from the start, even though nothing produces them yet, so the
 * screen does not need changing when Módulo 3 lands.
 *
 * RLS does the filtering, so this can only ever return what the caller may
 * already see.
 */
const FINAL_PRODUCT_TYPES = [
  "composition",
  "export_flat",
  "export_model",
  "export_ai",
] as const;

export async function listClientFinalProducts(
  supabase: SupabaseClient,
  clientId: string
): Promise<FinalProduct[]> {
  const { data: projectData } = await supabase
    .from("projects")
    .select("id, name")
    .eq("client_id", clientId);

  const projects = (projectData ?? []) as { id: string; name: string }[];
  if (projects.length === 0) return [];

  const { data: designData } = await supabase
    .from("designs")
    .select("id, name, version, project_id")
    .in(
      "project_id",
      projects.map((project) => project.id)
    );

  const designs = (designData ?? []) as {
    id: string;
    name: string;
    version: number;
    project_id: string;
  }[];
  if (designs.length === 0) return [];

  const { data: assetData } = await supabase
    .from("assets")
    .select("*")
    .in(
      "design_id",
      designs.map((design) => design.id)
    )
    .in("asset_type", FINAL_PRODUCT_TYPES as readonly string[])
    // Newest first: the last thing finished is the one most likely being
    // looked for, and it is the order the rest of the app uses for catalogs.
    .order("created_at", { ascending: false });

  const assets = (assetData ?? []) as Asset[];
  if (assets.length === 0) return [];

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const designById = new Map(designs.map((design) => [design.id, design]));

  const withSignedUrls = await withUrls(assets);

  return withSignedUrls.flatMap((asset) => {
    const design = asset.design_id ? designById.get(asset.design_id) : undefined;
    // An asset whose design vanished between the two queries is dropped rather
    // than shown with blanks: this list is read, not edited, so a row nobody
    // can explain is worse than one row fewer.
    if (!design) return [];

    return [
      {
        ...asset,
        design_id_of: design.id,
        design_name: design.name,
        design_version: design.version,
        project_name: projectById.get(design.project_id)?.name ?? "",
      },
    ];
  });
}
