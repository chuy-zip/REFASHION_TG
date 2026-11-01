import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getClientAccess } from "@/lib/access";
import { listClientAssets, listDesignAssets } from "@/lib/assets-server";
import { isSimulated } from "@/lib/generation";
import { assetDisplayName } from "@/lib/assets";
import { getReadUrl } from "@/lib/r2";
import { listDesignLayers } from "@/lib/layers";
import {
  designHasWorkOnTop,
  garmentTypeLabel,
  resolveDesignImageAssetId,
  WORK_STEP_TYPES,
  workStepKind,
} from "@/lib/designs";
import { BaseGarmentPicker } from "@/components/designs/BaseGarmentPicker/BaseGarmentPicker";
import { DesignWorkspaceLoader } from "@/components/designs/DesignWorkspace/DesignWorkspaceLoader";
import { PresentLink } from "@/components/designs/PresentLink/PresentLink";
import type { WorkspaceLayer } from "@/components/designs/DesignWorkspace/DesignWorkspace";
import { Icon } from "@/components/ui/Icon/Icon";
import type { Asset, Client, Design, Project } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ id: string }> };

/**
 * The design's working screen: Módulo 1's canvas, where logos are composed over
 * the working image.
 *
 * Stays a Server Component and reads its data straight from Postgres; only the
 * canvas itself crosses into the browser (Konva cannot be server-rendered).
 * Módulos 2 and 3 land here too, as tool modes rather than separate routes —
 * the canvas, the R2 loading and the export are built once and shared.
 */
export default async function DesignEditPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createSupabaseClient();

  const { data: designData } = await supabase
    .from("designs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!designData) notFound();
  const design = designData as Design;

  const { data: projectData } = await supabase
    .from("projects")
    .select("id, name, client_id")
    .eq("id", design.project_id)
    .maybeSingle();

  if (!projectData) notFound();
  const project = projectData as Pick<Project, "id" | "name" | "client_id">;

  const user = await getAuthenticatedUser();

  const [
    { data: clientData },
    access,
    { assets: catalog },
    { layers },
    { assets: designAssets },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("id", project.client_id)
      .maybeSingle(),
    getClientAccess(supabase, project.client_id, user?.id ?? ""),
    listClientAssets(supabase, project.client_id),
    listDesignLayers(supabase, design.id),
    listDesignAssets(supabase, design.id),
  ]);

  const client = clientData as Pick<Client, "id" | "name"> | null;

  // The clean garment the composition sits on. Never a composition itself:
  // baking the logo in would leave the generative modules working on an image
  // that already has it.
  const workingAssetId = resolveDesignImageAssetId(design);

  let workingImageUrl: string | null = null;
  if (workingAssetId) {
    const { data: assetData } = await supabase
      .from("assets")
      .select("*")
      .eq("id", workingAssetId)
      .maybeSingle();

    if (assetData) {
      workingImageUrl = await getReadUrl((assetData as Asset).r2_key);
    }
  }

  const logos = catalog.filter((asset) => asset.asset_type === "logo");

  /**
   * The strip: where the working image has been, oldest first.
   *
   * The base garment opens it because that is where every design starts, and it
   * is marked so the strip can draw it as what it is — an image belonging to
   * the client's catalogue, not a step this design produced.
   *
   * `listDesignAssets` already comes back ordered by creation, which is the
   * order the strip promises: it never reorders, so position means history.
   */
  const baseAsset = design.base_asset_id
    ? catalog.find((asset) => asset.id === design.base_asset_id) ?? null
    : null;

  const steps = [
    ...(baseAsset
      ? [
          {
            id: baseAsset.id,
            url: baseAsset.url,
            createdAt: baseAsset.created_at,
            costUsd: null,
            kind: "origin" as const,
            width: baseAsset.width_px,
            height: baseAsset.height_px,
            bytes: baseAsset.file_size_bytes,
            origin: baseAsset.origin,
            generation: null,
          },
        ]
      : []),
    ...designAssets
      .filter((asset) =>
        (WORK_STEP_TYPES as readonly string[]).includes(asset.asset_type)
      )
      .map((asset) => ({
        id: asset.id,
        url: asset.url,
        createdAt: asset.created_at,
        costUsd: asset.cost_usd,
        // Both axes, because the type alone cannot tell a free brush stroke
        // from a paid generation: both are stored as `inpainting`.
        kind: workStepKind(asset.asset_type, asset.origin),
        width: asset.width_px,
        height: asset.height_px,
        bytes: asset.file_size_bytes,
        origin: asset.origin,
        // `origin` y no el tipo: es el eje que separa lo que costó dinero de
        // lo que hizo el navegador, y los dos se guardan como 'inpainting'.
        generation:
          asset.origin === "generated"
            ? {
                prompt: asset.generation_prompt,
                model: asset.generation_model,
                seed: asset.generation_seed,
                steps: asset.generation_steps,
                strength: asset.generation_strength,
                latencyMs: asset.generation_latency_ms,
                parentId: asset.parent_asset_id,
                maskId: asset.mask_asset_id,
              }
            : null,
      })),
  ];

  // Pair each layer with its logo's signed URL. A layer whose asset is gone
  // simply does not draw: the FK cascades, so this only guards against a
  // catalog the user cannot fully see.
  const logoById = new Map(catalog.map((asset) => [asset.id, asset]));
  const workspaceLayers: WorkspaceLayer[] = layers.flatMap((layer) => {
    const logo = logoById.get(layer.asset_id);
    if (!logo) return [];
    return [{ ...layer, url: logo.url, name: assetDisplayName(logo) }];
  });

  /**
   * Si hay logotipos colocados que todavía no están en ninguna composición al
   * día.
   *
   * **Tres condiciones, y las tres importan.** Sin capas no hay nada que
   * aplicar, así que un diseño sin logotipos nunca pregunta. Con capas y sin
   * composición, falta aplicarlas. Y con capas y con composición, sigue
   * faltando si la prenda cambió después: una composición es un aplanado, y lo
   * que se editó luego no está adentro.
   */
  const composicionesDelDiseno = designAssets.filter(
    (asset) => asset.asset_type === "composition"
  );
  const ultimaComposicion = composicionesDelDiseno.at(-1) ?? null;
  const recursoDeTrabajo = designAssets.find(
    (asset) => asset.id === workingAssetId
  );

  const logosPending =
    workspaceLayers.length > 0 &&
    (ultimaComposicion === null ||
      (recursoDeTrabajo !== undefined &&
        new Date(recursoDeTrabajo.created_at) >
          new Date(ultimaComposicion.created_at)));


  return (
    <main className={styles.page}>
      <div className={styles.head}>
        <div className={styles.header}>
          {/* The way back sits ON the title row instead of above it, and it no
              longer repeats the design's name.

              It used to be a full line reading "← diseño de prueba 2" directly
              above an <h1> reading "diseño de prueba 2": the same words twice,
              costing a whole row on the one screen where vertical space is the
              canvas. Up to the design's hub, not the project — that is where
              the history and the other destinations live. */}
          <Link
            className={styles.back}
            href={`/designs/${design.id}`}
            aria-label="Volver al diseño"
            title="Volver al diseño"
          >
            <Icon name="arrowBack" size={18} />
          </Link>

          <div className={styles.identity}>
            <h1 className={styles.title}>{design.name}</h1>
            <p className={styles.subtitle}>
              {client?.name} · {garmentTypeLabel(design.garment_type)} · v
              {design.version}
            </p>
          </div>
          {/* **La salida hacia adelante, siempre disponible.**
              Antes solo aparecía después de crear una composición, así que
              quien pintaba la prenda y quería probarla sobre un modelo tenía
              que volver al hub y desde ahí entrar a presentación. Dos pasos
              hacia atrás para ir hacia adelante.

              Solo con una prenda asignada: sin imagen de trabajo no hay nada
              que presentar, y un enlace a una pantalla vacía no es un atajo. */}
          {workingImageUrl && (
            <PresentLink
              href={`/designs/${design.id}/present`}
              logosPending={logosPending}
            />
          )}
          <BaseGarmentPicker
            designId={design.id}
            clientId={project.client_id}
            baseAssetId={design.base_asset_id}
            canEdit={access.canEdit}
            hasWorkOnTop={designHasWorkOnTop(design)}
            triggerLabel={
              workingImageUrl ? "Cambiar prenda base" : "Elegir prenda base"
            }
            triggerVariant={workingImageUrl ? "secondary" : "primary"}
          />
        </div>
      </div>

      <DesignWorkspaceLoader
        designId={design.id}
        designName={design.name}
        clientId={project.client_id}
        workingImageUrl={workingImageUrl}
        workingAssetId={workingAssetId}
        logos={logos}
        initialLayers={workspaceLayers}
        steps={steps}
        currentAssetId={design.current_asset_id}
        // Del recurso de PARTIDA, no del de trabajo: una vez que el diseño
        // arrancó de una foto de modelo, todo lo que derive sigue teniendo una
        // persona adentro.
        baseAssetType={baseAsset?.asset_type ?? null}
        // Read here and not in the canvas: the provider lives behind
        // `server-only`, so the browser is told the answer rather than asking.
        isSimulated={isSimulated()}
        canEdit={access.canEdit}
      />
    </main>
  );
}
