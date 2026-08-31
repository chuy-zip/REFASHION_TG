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
  isHistoryStep,
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
        <div className={styles.identity}>
          <div className={styles.heading}>
            <h1 className={styles.title}>{design.name}</h1>
            <Badge tone={DESIGN_STATUS_COPY[design.status].tone}>
              {DESIGN_STATUS_COPY[design.status].label}
            </Badge>
          </div>
          {/* One condensed line where a four-row side panel used to be. Two of
              its five facts were already on screen (the back link names the
              project, the subtitle named the client), so the panel was mostly
              paying rent to hold two buttons. */}
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
            {" · "}
            {garmentTypeLabel(design.garment_type)} · v{design.version}
            {originAsset && (
              <>
                {" · "}
                <span className={styles.metaFile} title="Prenda base">
                  {assetDisplayName(originAsset)}
                </span>
              </>
            )}
          </p>
        </div>

        {/* What can be done with what you are looking at, in the row that
            names it — same rule as "Cambiar prenda base" in /edit. */}
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
          <DesignActionsMenu
            design={design}
            canEdit={access.canEdit}
            assetCount={designAssets.length}
            redirectOnDelete={`/projects/${project.id}`}
          />
        </div>
      </div>

      <figure className={styles.stage}>
        <div
          className={`${styles.canvas} ${heroAsset ? "" : styles.canvasIsEmpty}`}
        >
          {heroAsset ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply
            <img
              className={styles.canvasImage}
              src={heroAsset.url}
              crossOrigin="anonymous"
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

        {/* The version note describes the image, so it sits under it. In the
            side panel it was a field called "Notas" that nobody read while
            looking at the garment. */}
        {design.notes && (
          <figcaption className={styles.notes}>{design.notes}</figcaption>
        )}
      </figure>

      {/* Masks are filtered out here rather than at the query: they still count
          as images of the design for anything that asks how much would be lost
          by deleting it. What they are not is a step of the history. */}
      <DesignTimeline
        originAsset={originAsset}
        assets={designAssets.filter((asset) => isHistoryStep(asset.asset_type))}
      />
    </main>
  );
}
