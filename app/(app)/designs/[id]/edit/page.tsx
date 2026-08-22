import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getClientAccess } from "@/lib/access";
import { listClientAssets } from "@/lib/assets-server";
import { assetDisplayName } from "@/lib/assets";
import { getReadUrl } from "@/lib/r2";
import { listDesignLayers } from "@/lib/layers";
import {
  designHasWorkOnTop,
  garmentTypeLabel,
  resolveDesignImageAssetId,
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

  const [{ data: clientData }, access, { assets: catalog }, { layers }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("id", project.client_id)
        .maybeSingle(),
      getClientAccess(supabase, project.client_id, user?.id ?? ""),
      listClientAssets(supabase, project.client_id),
      listDesignLayers(supabase, design.id),
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
        {/* Up to the design's hub, not to the project: the hub is where you
            came from, and where the history and the other destinations live. */}
        <Link className={styles.back} href={`/designs/${design.id}`}>
          <Icon name="arrowBack" size={16} />
          {design.name}
        </Link>

        <div className={styles.header}>
          <div>
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
        canEdit={access.canEdit}
      />
    </main>
  );
}
