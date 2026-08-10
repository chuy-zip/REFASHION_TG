import type { SupabaseClient } from "@supabase/supabase-js";
import type { BadgeTone } from "@/components/ui/Badge/Badge";
import type { AssetWithUrl } from "@/lib/assets";
import type { Design, DesignStatus } from "@/lib/types";

/**
 * User-facing Spanish copy for design statuses (code/DB keep English).
 *
 * `active` is meant to be set automatically once a design produces its first
 * generated asset — that hook lands with Módulo 1, since nothing creates
 * design-level assets yet. Until then it is set by hand, like the others.
 */
export const DESIGN_STATUS_COPY: Record<
  DesignStatus,
  { label: string; tone: BadgeTone }
> = {
  draft: { label: "Borrador", tone: "neutral" },
  active: { label: "En progreso", tone: "success" },
  completed: { label: "Terminado", tone: "muted" },
};

export function designStatusLabel(status: DesignStatus): string {
  return DESIGN_STATUS_COPY[status]?.label ?? status;
}

/**
 * Curated subset of garment_type for the UI. The column itself is free text
 * (no DB constraint) so future types can be added here without a migration.
 */
export type GarmentType = "shirt" | "polo" | "hoodie";

export const GARMENT_TYPE_COPY: Record<GarmentType, { label: string }> = {
  shirt: { label: "Camisa" },
  polo: { label: "Polo" },
  hoodie: { label: "Hoodie" },
};

export function garmentTypeLabel(garmentType: string): string {
  return (
    GARMENT_TYPE_COPY[garmentType as GarmentType]?.label ?? garmentType
  );
}

/**
 * Which image a design hands over when something starts from it — the canvas
 * image of an iteration, or the thumbnail shown for it in a picker.
 *
 * Today a design's only image is the catalog asset it started from. Once
 * designs accumulate their own assets (composition/inpainting/export, Módulo
 * 1+), this is the single place that changes to return the latest one instead.
 */
export function resolveDesignImageAssetId(
  design: Pick<Design, "base_asset_id">
): string | null {
  return design.base_asset_id;
}

/** A design offered as a starting point, with its preview resolved. */
export interface DesignOption {
  id: string;
  name: string;
  version: number;
  garment_type: string;
  previewUrl: string | null;
}

/**
 * Pairs designs with the already-signed URL of their image. Pure so it can run
 * either on the server (project page) or in the browser (wizard) against an
 * asset list that was fetched once — no second round of URL signing.
 */
export function toDesignOptions(
  designs: Design[],
  assets: AssetWithUrl[]
): DesignOption[] {
  const urlById = new Map(assets.map((asset) => [asset.id, asset.url]));

  return designs.map((design) => {
    const assetId = resolveDesignImageAssetId(design);
    return {
      id: design.id,
      name: design.name,
      version: design.version,
      garment_type: design.garment_type,
      previewUrl: assetId ? urlById.get(assetId) ?? null : null,
    };
  });
}

/** Where a design sits in the hierarchy: which project, and whose client. */
export interface DesignPath {
  projectId: string;
  clientId: string;
}

/**
 * Walks design → project → client in one round trip.
 *
 * Two callers need it and for different reasons, which is why it is here and
 * not inlined: `presign-upload` needs both ids to build the R2 key
 * (`clients/{client}/projects/{project}/designs/{design}/...`) *and* the
 * client to authorise by hand, since that route never touches the database and
 * so RLS never runs for it. Returns null when the design does not exist or RLS
 * hides it, which the callers treat the same way on purpose.
 */
export async function resolveDesignPath(
  supabase: SupabaseClient,
  designId: string
): Promise<DesignPath | null> {
  const { data } = await supabase
    .from("designs")
    .select("project_id, projects(client_id)")
    .eq("id", designId)
    .maybeSingle();

  const row = data as {
    project_id: string;
    projects: { client_id: string } | null;
  } | null;

  if (!row?.projects) return null;

  return { projectId: row.project_id, clientId: row.projects.client_id };
}

/**
 * Whether a catalog asset may be referenced as a design's starting image.
 *
 * Foreign keys are verified below RLS (APRENDIZAJES §2.5b), so the FK on
 * `designs.base_asset_id` would happily accept an asset belonging to another
 * client. Reading the asset here *does* go through RLS, so this answers both
 * questions at once: can this user see it, and is it in the right catalog.
 *
 * Lives in lib/ because two endpoints need the identical check (POST /api/designs
 * and PATCH /api/designs/:id) and getting it wrong in one of them is invisible
 * until cross-client references show up in the data.
 */
export async function assetBelongsToProjectClient(
  supabase: SupabaseClient,
  assetId: string,
  projectId: string
): Promise<boolean> {
  const [{ data: assetData }, { data: projectData }] = await Promise.all([
    supabase.from("assets").select("client_id").eq("id", assetId).maybeSingle(),
    supabase
      .from("projects")
      .select("client_id")
      .eq("id", projectId)
      .maybeSingle(),
  ]);

  const assetClientId = (assetData as { client_id: string | null } | null)
    ?.client_id;
  const projectClientId = (projectData as { client_id: string } | null)
    ?.client_id;

  return Boolean(
    assetClientId && projectClientId && assetClientId === projectClientId
  );
}

/** Designs of a project, newest first. RLS returns only what the user may see. */
export async function listProjectDesigns(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ designs: Design[]; error: string | null }> {
  const { data, error } = await supabase
    .from("designs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return { designs: [], error: error.message };
  return { designs: (data ?? []) as Design[], error: null };
}
