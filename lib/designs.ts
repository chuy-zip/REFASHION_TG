import type { SupabaseClient } from "@supabase/supabase-js";
import type { BadgeTone } from "@/components/ui/Badge/Badge";
import type { Design, DesignAssetType, DesignStatus } from "@/lib/types";

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
 * Which image a design is working on: the canvas image, the thumbnail a picker
 * shows for it, and what an iteration inherits.
 *
 * Reads the explicit pointer and falls back to the starting image. It is
 * deliberately NOT "the most recent asset": that answer is only right while the
 * history is a straight line, and it breaks at the time travel that motivated
 * keeping a history (go back to B, reload, and "most recent" hands back C).
 *
 * The fallback is what lets `current_asset_id` stay null until a design
 * actually moves, so no row had to be backfilled by migration 013.
 */
export function resolveDesignImageAssetId(
  design: Pick<Design, "base_asset_id" | "current_asset_id">
): string | null {
  return design.current_asset_id ?? design.base_asset_id;
}

/**
 * Whether the design has moved past its starting image.
 *
 * Gates changing the base garment: while a design is still sitting on its
 * base, swapping it is harmless. Once there is work on top, the working image
 * descends from the *old* base, so swapping would leave `base_asset_id`
 * describing something the design no longer came from — the same defect
 * migration 010 removed from `version`. The way to start
 * from another garment is to create a new version, which is what
 * `parent_design_id` is for.
 */
export function designHasWorkOnTop(
  design: Pick<Design, "base_asset_id" | "current_asset_id">
): boolean {
  return (
    design.current_asset_id !== null &&
    design.current_asset_id !== design.base_asset_id
  );
}

/**
 * A design plus a signed URL of **how it looks**: its latest composition, or
 * the working image when it has composed nothing yet.
 *
 * The distinction matters and is easy to get backwards. What a design *looks
 * like* includes its logos; what an iteration *inherits* is the clean working
 * image. Showing the clean garment in a picker misrepresents the design
 * — the user recognises their proposal by the logo on it.
 */
export interface DesignWithPreview extends Design {
  preview_url: string | null;
  /**
   * When the design last saw work: the later of its own `updated_at` and the
   * newest asset it produced.
   *
   * `updated_at` alone would lie in the common case. It moves when the *row*
   * changes (name, status, working image), and exporting a composition only
   * touches the row the first time, when `status` advances from draft. A design
   * with five compositions would show the date of the first one.
   *
   * Still not perfect: moving a logo writes to `design_layers`, which neither
   * of these two watches. Closing that needs a third query and was deliberately
   * left out.
   */
  last_activity: string;
  /** How many images the design owns, for its delete confirmation. */
  asset_count: number;
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
 * Foreign keys are verified below RLS, so the FK on
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

/**
 * Design-level asset types that may become the working image.
 *
 * An allowlist, not a blocklist, and short on purpose. The working image has to
 * be a **clean garment**: `composition` has the logo baked in, `mask` is not a
 * garment at all, `ai_model` is a person, and `export_*` are deliverables.
 * Pointing `current_asset_id` at any of those would hand the next inpainting an
 * image it must never see.
 *
 * `inpainting` and `edit` both qualify, and for the same reason: each returns
 * the same garment with one thing changed, which is exactly what the next step
 * should receive. They are separate types because they are separate techniques
 * — one paints on a region, the other is asked in words — but downstream they
 * are interchangeable.
 *
 * `vton` is deliberately absent: it is a person wearing the garment, so it
 * closes the pipeline rather than continuing it. Módulo 3 revisits this if that
 * turns out to be wrong.
 */
const WORKING_IMAGE_TYPES: DesignAssetType[] = ["inpainting", "edit"];

/**
 * Whether an asset may become a design's working image.
 *
 * Two questions, both needed. Does it belong to this design's history — the FK
 * only proves the asset exists, and RLS does not guard what one table
 * *references* from another. And is it the right *kind* of
 * image: the timeline shows compositions as records, but a composition is a
 * render, never a step to resume from.
 */
export async function assetIsUsableAsCurrent(
  supabase: SupabaseClient,
  assetId: string,
  design: Pick<Design, "id" | "base_asset_id">
): Promise<boolean> {
  // The starting image, whatever catalog type it is (base_garment or a
  // tech_drawing), is always a valid place to go back to.
  if (assetId === design.base_asset_id) return true;

  const { data } = await supabase
    .from("assets")
    .select("design_id, asset_type")
    .eq("id", assetId)
    .maybeSingle();

  const asset = data as {
    design_id: string | null;
    asset_type: DesignAssetType;
  } | null;

  return (
    asset?.design_id === design.id &&
    WORKING_IMAGE_TYPES.includes(asset.asset_type)
  );
}

/**
 * How many designs a project screen shows at a time.
 *
 * Twelve is two full rows at the grid's 14rem columns on a wide monitor, and it
 * is also the ceiling on how many images that screen resolves: every design
 * card carries a preview, so the page size *is* the image budget.
 */
/**
 * Which asset types count as a step of the working image.
 *
 * The strip on the working screen shows the CLEAN garment as it advances — the
 * images a mask is painted on and that a generation consumes. A composition is
 * a render of the garment *with its logos*, which is a different history and
 * belongs to the hub's strip.
 *
 * Written here rather than as a filter at the call site because two screens ask
 * the same question and would otherwise answer it differently.
 *
 * **`edit` belongs here for the same reason `inpainting` does**, and leaving it
 * out was an oversight with a confusing symptom: `WORKING_IMAGE_TYPES` already
 * accepted it, so an instruction edit could become the image the design works
 * on while never appearing in the strip that shows how it got there. The two
 * lists answer different questions — "may this continue the design" and "is
 * this a step someone should see" — but an image that continues the design is
 * always a step, so nothing may be in one and not the other.
 */
export const WORK_STEP_TYPES = ["inpainting", "edit"] as const;

/**
 * **Una máscara nunca cuenta como resultado ni como paso**, y conviene que la
 * razón no se pierda con la función que la decía: es un *insumo* de un paso, no
 * un paso. Describe dónde se pidió una edición, no se puede reabrir ni
 * reutilizar, y nadie querría volver a ella. Listarla junto a las prendas
 * convierte una cronología en una bitácora, y un rectángulo negro en medio de
 * una fila de camisas es ruido que hay que explicar cada vez.
 *
 * Se guarda igual, y a propósito: junto con `generation_prompt` es lo que hace
 * reproducible una generación — el prompt dice qué se pidió y la máscara dónde.
 */

export function isDeliverable(assetType: string): boolean {
  return (
    assetType === "composition" ||
    assetType === "vton" ||
    assetType === "export_flat" ||
    assetType === "export_model" ||
    assetType === "export_ai"
  );
}

export const DESIGNS_PAGE_SIZE = 12;

/**
 * How many designs a project card shows as its sample strip.
 *
 * Lives here next to the page size because the two caps only work together:
 * six projects per page × four samples is what makes the client's Proyectos tab
 * cost a fixed 24 images instead of four per project that exists.
 */
export const PROJECT_SAMPLE_SIZE = 4;

/** One thumbnail of a project's sample strip. */
export interface ProjectSample {
  design_id: string;
  name: string;
  preview_url: string | null;
}

/**
 * A project's sample strip: its most recent designs, and how many it has in
 * total — the card shows four and says "5 diseños", and both come from the
 * same query.
 */
export interface ProjectSamples {
  design_count: number;
  samples: ProjectSample[];
}

export interface DesignListOptions {
  /** Case-insensitive match on the design name. */
  query?: string;
  /** 1-based. Omit both to get every design (the wizard needs them all). */
  page?: number;
  pageSize?: number;
}

/**
 * Designs of a project, newest first, optionally filtered and paged. RLS
 * returns only what the user may see.
 *
 * `total` is the count **before** paging, so the pager can say "13 a 24 de 31"
 * without a second query.
 */
export async function listProjectDesigns(
  supabase: SupabaseClient,
  projectId: string,
  options: DesignListOptions = {}
): Promise<{ designs: Design[]; total: number; error: string | null }> {
  let request = supabase
    .from("designs")
    .select("*", { count: "exact" })
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  const query = options.query?.trim();
  if (query) {
    // Known limitation: `%` and `_` typed by the user still act as SQL LIKE
    // wildcards, so searching "50%" matches more than it should. Harmless (the
    // value is parameterised, never interpolated) and left visible on purpose
    // rather than fixed with escaping that nothing here can test.
    request = request.ilike("name", `%${query}%`);
  }

  if (options.page && options.pageSize) {
    const from = (options.page - 1) * options.pageSize;
    request = request.range(from, from + options.pageSize - 1);
  }

  const { data, error, count } = await request;

  if (error) return { designs: [], total: 0, error: error.message };
  return {
    designs: (data ?? []) as Design[],
    total: count ?? 0,
    error: null,
  };
}

/**
 * What kind of step an image in the strip is, told by both axes at once.
 *
 * **`asset_type` alone would lie here**, and that is the whole reason this
 * function exists. A recolour done with the brush and a generation done by the
 * model are both stored as `inpainting`, because the column records *what the
 * image is*, not how it was obtained. The second axis, `origin`, records that:
 * `derived` for something computed on this machine for free, `generated` for
 * something a paid model produced. Colouring the strip by type alone would put
 * the same mark on a free brush stroke and on a paid generation.
 *
 * So the four kinds are the four things a user actually did:
 *
 *   - **origin**: the garment or photo the design started from. Not a step this
 *     design produced; it belongs to the client's catalogue.
 *   - **paint**: deterministic and free. Recolour, flat fill, eyedropper.
 *   - **inpaint**: a paid model working inside a painted region.
 *   - **instruction**: a paid model working with no region at all (Kontext).
 *
 * The last two are the distinction `edit` was added for in migration 018, and
 * it is *with a mask against without one*, not deterministic against
 * generative. Both questions now have an answer and neither is guessed.
 */
export type WorkStepKind = "origin" | "paint" | "inpaint" | "instruction";

export function workStepKind(
  assetType: string,
  origin: string | null
): WorkStepKind {
  if (assetType === "edit") return "instruction";
  if (origin === "derived") return "paint";
  return "inpaint";
}

/**
 * What each kind is called on screen, and what it is.
 *
 * In `lib/` and not in the component because the strip is not the only place
 * that will ever have to name these: the hub, the report and any future filter
 * all need the same four words, and four screens inventing their own synonyms
 * is how a vocabulary stops being one.
 */
export const WORK_STEP_COPY: Record<
  WorkStepKind,
  { label: string; title: string }
> = {
  origin: {
    label: "Partida",
    title: "Punto de partida, del catálogo del cliente",
  },
  paint: {
    label: "Pintado",
    title: "Pintado a mano, sin IA. No cuesta nada",
  },
  inpaint: {
    label: "IA por zona",
    title: "Generado por IA dentro de la zona que pintaste",
  },
  instruction: {
    label: "IA por instrucción",
    title: "Generado por IA a partir de una instrucción, sin zona",
  },
};
