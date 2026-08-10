import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getClientAccess } from "@/lib/access";
import { getReadUrl, getDownloadUrl } from "@/lib/r2";
import { listDesignAssets } from "@/lib/assets-server";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import {
  DESIGN_STATUS_COPY,
  garmentTypeLabel,
  resolveDesignImageAssetId,
} from "@/lib/designs";
import { DesignActionsMenu } from "@/components/designs/DesignActionsMenu/DesignActionsMenu";
import { DesignTimeline } from "@/components/designs/DesignTimeline/DesignTimeline";
import { Badge } from "@/components/ui/Badge/Badge";
import { Icon } from "@/components/ui/Icon/Icon";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import type { Asset, Client, Design, Project } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ id: string }> };

/**
 * A design's hub: what it is, what it looks like now, and how it got there.
 *
 * Exists because the list used to link straight to /edit, so anyone who only
 * wanted to *look* at a design (a viewer, or a seller showing it to a client)
 * landed in a screen called "edit" with a toolbar. Every destination is one
 * click from here and nothing is nested: a modal is a focused subtask, so it
 * never holds a button that navigates away.
 */
export default async function DesignHubPage({ params }: PageProps) {
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

  const [{ data: clientData }, access, { assets: designAssets }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("id", project.client_id)
        .maybeSingle(),
      getClientAccess(supabase, project.client_id, user?.id ?? ""),
      listDesignAssets(supabase, design.id),
    ]);

  const client = clientData as Pick<Client, "id" | "name"> | null;

  // Two different questions that happen to have the same answer today: what the
  // canvas is working on, and where the design started. They diverge once
  // designs.current_asset_id lands (migration 013), so they are asked
  // separately here and resolved in one query.
  const heroAssetId = resolveDesignImageAssetId(design);
  const originAssetId = design.base_asset_id;

  const catalogIds = [
    ...new Set([heroAssetId, originAssetId].filter(Boolean) as string[]),
  ];

  const catalogById = new Map<string, AssetWithUrl>();
  if (catalogIds.length > 0) {
    const { data: catalogData } = await supabase
      .from("assets")
      .select("*")
      .in("id", catalogIds);

    await Promise.all(
      ((catalogData ?? []) as Asset[]).map(async (asset) => {
        catalogById.set(asset.id, {
          ...asset,
          url: await getReadUrl(asset.r2_key),
          downloadUrl: await getDownloadUrl(
            asset.r2_key,
            assetDisplayName(asset)
          ),
        });
      })
    );
  }

  const heroAsset = heroAssetId ? catalogById.get(heroAssetId) ?? null : null;
  const originAsset = originAssetId
    ? catalogById.get(originAssetId) ?? null
    : null;

  return (
    <main className={styles.page}>
      <Link className={styles.back} href={`/projects/${project.id}`}>
        <Icon name="arrowBack" size={16} />
        {project.name}
      </Link>

      <div className={styles.header}>
        <div>
          <div className={styles.heading}>
            <h1 className={styles.title}>{design.name}</h1>
            <Badge tone={DESIGN_STATUS_COPY[design.status].tone}>
              {DESIGN_STATUS_COPY[design.status].label}
            </Badge>
          </div>
          <p className={styles.subtitle}>
            {client?.name} · {garmentTypeLabel(design.garment_type)} · v
            {design.version}
          </p>
        </div>
        <DesignActionsMenu
          design={design}
          canEdit={access.canEdit}
          redirectOnDelete={`/projects/${project.id}`}
        />
      </div>

      <div className={styles.overview}>
        <div className={styles.canvas}>
          {heroAsset ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply
            <img
              className={styles.canvasImage}
              src={heroAsset.url}
              alt={design.name}
            />
          ) : (
            <div className={styles.canvasEmpty}>
              <p className={styles.canvasEmptyTitle}>Sin prenda base todavía</p>
              <p className={styles.canvasEmptyHint}>
                Entra a editar el diseño para elegir una.
              </p>
            </div>
          )}
        </div>

        <div className={styles.side}>
          <div className={styles.actions}>
            <Link
              className={`${buttonStyles.base} ${buttonStyles.primary}`}
              href={`/designs/${design.id}/edit`}
            >
              Editar diseño
            </Link>
            <Link
              className={`${buttonStyles.base} ${buttonStyles.secondary}`}
              href={`/designs/${design.id}/present`}
            >
              Presentación
            </Link>
          </div>

          <div className={styles.facts}>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Proyecto</span>
              <Link
                className={styles.factLink}
                href={`/projects/${project.id}`}
              >
                {project.name}
              </Link>
            </div>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Cliente</span>
              <Link
                className={styles.factLink}
                href={`/clients/${project.client_id}`}
              >
                {client?.name ?? "Sin cliente"}
              </Link>
            </div>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Prenda base</span>
              <span className={styles.factValue}>
                {originAsset
                  ? assetDisplayName(originAsset)
                  : "Sin asignar"}
              </span>
            </div>
            {design.notes && (
              <div className={styles.fact}>
                <span className={styles.factLabel}>Notas</span>
                <span className={`${styles.factValue} ${styles.notes}`}>
                  {design.notes}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <DesignTimeline originAsset={originAsset} assets={designAssets} />
    </main>
  );
}
