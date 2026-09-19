import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { getReadUrl } from "@/lib/r2";
import { resolveDesignImageAssetId } from "@/lib/designs";
import { listClientAssets, listDesignAssets } from "@/lib/assets-server";
import { Icon } from "@/components/ui/Icon/Icon";
import { PresentationTabs } from "@/components/designs/PresentationTabs/PresentationTabs";
import type { Asset, Client, Design, Project } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ id: string }> };

export default async function DesignPresentPage({ params }: PageProps) {
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

  const { data: clientData } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", project.client_id)
    .maybeSingle();
  const client = clientData as Pick<Client, "id" | "name"> | null;

  // What "Plana" shows is a **composition**: the garment with its logos, which
  // is what the client is buying (objetivo específico 3a). The clean working
  // image is only the fallback for a design that has composed nothing yet
  // (FASE_1_5 §7.7, Regla 3).
  const { assets: designAssets } = await listDesignAssets(supabase, design.id);
  const compositions = designAssets.filter(
    (asset) => asset.asset_type === "composition"
  );

  // Las fotos de modelo del cliente, para las dos pestañas de prueba virtual.
  // Se leen acá y no dentro de las pestañas porque no cambian mientras la
  // pantalla está abierta, y las dos harían la misma consulta.
  const { assets: catalog } = await listClientAssets(supabase, project.client_id);
  const models = catalog.filter((asset) => asset.asset_type === "model_photo");

  const imageAssetId = resolveDesignImageAssetId(design);

  let workingImageUrl: string | null = null;
  if (imageAssetId) {
    const { data: assetData } = await supabase
      .from("assets")
      .select("*")
      .eq("id", imageAssetId)
      .maybeSingle();

    if (assetData) {
      workingImageUrl = await getReadUrl((assetData as Asset).r2_key);
    }
  }

  return (
    <main className={styles.page}>
      <Link className={styles.back} href={`/designs/${design.id}`}>
        <Icon name="arrowBack" size={16} />
        {design.name}
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{design.name}</h1>
        <p className={styles.meta}>
          <Link
            className={styles.metaLink}
            href={`/clients/${project.client_id}`}
          >
            {client?.name ?? "Sin cliente"}
          </Link>
          {" · "}
          <Link className={styles.metaLink} href={`/projects/${project.id}`}>
            {project.name}
          </Link>
        </p>
      </div>

      <PresentationTabs
        designName={design.name}
        compositions={compositions}
        workingImageUrl={workingImageUrl}
        models={models}
      />
    </main>
  );
}
