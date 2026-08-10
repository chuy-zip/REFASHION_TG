import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getClientAccess } from "@/lib/access";
import { getReadUrl } from "@/lib/r2";
import {
  designHasWorkOnTop,
  garmentTypeLabel,
  resolveDesignImageAssetId,
} from "@/lib/designs";
import { BaseGarmentPicker } from "@/components/designs/BaseGarmentPicker/BaseGarmentPicker";
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

  const user = await getAuthenticatedUser();

  const [{ data: clientData }, access] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("id", project.client_id)
      .maybeSingle(),
    getClientAccess(supabase, project.client_id, user?.id ?? ""),
  ]);
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
      {/* Up to the design's hub, not to the project: the hub is where you came
          from, and where the history and the other destinations live. */}
      <Link className={styles.back} href={`/designs/${design.id}`}>
        <Icon name="arrowBack" size={16} />
        {design.name}
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
                Elige una imagen del catálogo del cliente o sube una nueva para
                empezar a trabajar.
              </p>
              <div className={styles.canvasEmptyAction}>
                <BaseGarmentPicker
                  designId={design.id}
                  clientId={project.client_id}
                  baseAssetId={design.base_asset_id}
                  canEdit={access.canEdit}
                  hasWorkOnTop={designHasWorkOnTop(design)}
                  triggerLabel="Elegir prenda base"
                  triggerVariant="primary"
                />
              </div>
            </div>
          )}
        </div>

        <div className={styles.toolbar}>
          {/* Only once there is one to change: with an empty canvas the empty
              state already carries the primary action, and two buttons for the
              same thing would compete. */}
          {canvasImageUrl && (
            <>
              <span className={styles.toolbarLabel}>Prenda</span>
              {/* secondary, not ghost: the mocked tools below are ghost AND
                  disabled, so a ghost control here differed from dead
                  placeholders by one shade of grey and read as a label. */}
              <BaseGarmentPicker
                designId={design.id}
                clientId={project.client_id}
                baseAssetId={design.base_asset_id}
                canEdit={access.canEdit}
                hasWorkOnTop={designHasWorkOnTop(design)}
                triggerLabel="Cambiar prenda base"
                triggerVariant="secondary"
              />
            </>
          )}

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
        {/* Demoted while the canvas is empty: choosing a garment is the action
            of the screen then, and the guide allows one primary at a time. */}
        <Link
          className={`${buttonStyles.base} ${
            canvasImageUrl ? buttonStyles.primary : buttonStyles.secondary
          }`}
          href={`/designs/${design.id}/present`}
        >
          Continuar a presentación →
        </Link>
      </div>
    </main>
  );
}
