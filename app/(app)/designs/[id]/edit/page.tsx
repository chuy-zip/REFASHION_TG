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
} from "@/lib/designs";
import { BaseGarmentPicker } from "@/components/designs/BaseGarmentPicker/BaseGarmentPicker";
import { DesignWorkspaceLoader } from "@/components/designs/DesignWorkspace/DesignWorkspaceLoader";
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
 * the canvas, the R2 loading and the export are built once and shared
 * (FASE_1_5 §7.5).
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
  // that already has it (§7.7).
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
            isOrigin: true,
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
        isOrigin: false,
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
