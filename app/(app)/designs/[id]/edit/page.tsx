import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { getReadUrl } from "@/lib/r2";
import { garmentTypeLabel, resolveDesignImageAssetId } from "@/lib/designs";
import { Icon } from "@/components/ui/Icon/Icon";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import type { Asset, Client, Design, Project } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ id: string }> };

const MOCK_TOOLS = ["Logo", "Textura", "Máscara", "Color"];

/**
 * Editing screen scaffold: places the design's starting image (if any) on a
 * canvas. The real tools (composición de logo, difusión por zonas) are a
 * separate module — this only reserves their place in the UI, same pattern
 * as the placeholders used elsewhere.
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

  const { data: clientData } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", project.client_id)
    .maybeSingle();
  const client = clientData as Pick<Client, "id" | "name"> | null;

  // The starting image is persisted on the design (migration 010), so a
  // reload no longer loses it the way the old `?base=` query param did.
  const imageAssetId = resolveDesignImageAssetId(design);

  let canvasImageUrl: string | null = null;
  if (imageAssetId) {
    const { data: assetData } = await supabase
      .from("assets")
      .select("*")
      .eq("id", imageAssetId)
      .maybeSingle();

    if (assetData) canvasImageUrl = await getReadUrl((assetData as Asset).r2_key);
  }

  return (
    <main className={styles.page}>
      <Link className={styles.back} href={`/projects/${project.id}`}>
        <Icon name="arrowBack" size={16} />
        {project.name}
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>{design.name}</h1>
        <p className={styles.subtitle}>
          {client?.name} · {garmentTypeLabel(design.garment_type)} · v
          {design.version}
        </p>
      </div>

      <div className={styles.canvasArea}>
        <div className={styles.canvas}>
          {canvasImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply
            <img
              className={styles.canvasImage}
              src={canvasImageUrl}
              alt={design.name}
            />
          ) : (
            <div className={styles.canvasEmpty}>
              <p className={styles.canvasEmptyTitle}>Sin prenda base todavía</p>
              <p className={styles.canvasEmptyHint}>
                Elige una desde la pestaña Recursos del cliente, o al crear el
                diseño.
              </p>
            </div>
          )}
        </div>

        <div className={styles.toolbar}>
          <span className={styles.toolbarLabel}>Herramientas</span>
          {MOCK_TOOLS.map((tool) => (
            <button
              key={tool}
              type="button"
              className={`${buttonStyles.base} ${buttonStyles.ghost}`}
              disabled
              title="Próximamente: llega con el módulo de edición."
            >
              {tool}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        <Link
          className={`${buttonStyles.base} ${buttonStyles.primary}`}
          href={`/designs/${design.id}/present`}
        >
          Continuar a presentación →
        </Link>
      </div>
    </main>
  );
}
