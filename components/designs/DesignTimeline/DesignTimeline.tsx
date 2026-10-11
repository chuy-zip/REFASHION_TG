"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AssetPreviewDialog } from "@/components/assets/AssetPreviewDialog/AssetPreviewDialog";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Thumbnail } from "@/components/ui/Thumbnail/Thumbnail";
import { assetTypeLabel, type AssetWithUrl } from "@/lib/assets";
import styles from "./DesignTimeline.module.css";

interface DesignTimelineProps {
  /**
   * The catalog image the design started from, shown as the strip's origin.
   * It is not a step: it belongs to the client, not to the design.
   */
  originAsset: AssetWithUrl | null;
  /** The design's own deliverables, oldest first (see listDesignAssets). */
  assets: AssetWithUrl[];
  /**
   * How many working steps live on the editing screen, and where to see them.
   *
   * **The cost comes from the caller and not from `assets`**, and that is the
   * whole reason this prop exists. The strip used to add up what it was given,
   * which was every asset of the design; now it is given only the deliverables,
   * and the expensive part of a design is the editing it took. Adding up what
   * is on screen would quietly report a smaller number than what was spent.
   */
  workStepCount: number;
  totalCostUsd: number;
  editHref: string;
}

const dateFormat = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The design's history: a stable chronological strip.
 *
 * `assets.parent_asset_id` makes the stored history a tree (going back and
 * generating again leaves two branches on the same parent), but the screen is
 * deliberately not one. Nobody navigates trees. Nothing here ever disappears
 * or changes position; once `designs.current_asset_id` exists, the only thing
 * that moves is the cursor marking where the user is standing.
 *
 * This is the **record** version of the strip, the one that lives on the design
 * hub: clicking a step opens it full size to look at it or download it. The
 * **control** version, with the cursor and "Retomar desde aquí", belongs on the
 * working screen — see FASE_1_5 §7.4.
 *
 * **It lists deliverables, not every asset.** It used to show everything except
 * masks, which meant it repeated the working steps that `/edit` already lets
 * you navigate, and buried the compositions among them — on the very screen
 * that exists to show what a design produced. The working steps are counted and
 * linked instead of listed (`isDeliverable` in `lib/designs.ts`).
 */
export function DesignTimeline({
  originAsset,
  assets,
  workStepCount,
  totalCostUsd,
  editHref,
}: DesignTimelineProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<AssetWithUrl | null>(null);

  const stepCount = assets.length;

  // Chronological order is kept (left to right), but the strip opens showing
  // the newest: that is the step you almost always came to see, and with the
  // oldest pinned to the left it would sit off-screen. Reversing the order
  // instead would make "go back in time" read as "move right", which is the
  // direction the cursor will need to mean the opposite.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip) strip.scrollLeft = strip.scrollWidth;
  }, [stepCount]);

  return (
    <section className={styles.section}>
      {/* A group label, not a section heading: the strip below is a record the
          user consults, and it must not read as loud as the garment. */}
      <div className={styles.header}>
        <h2 className={styles.title}>Resultados</h2>
        <span className={styles.count}>
          {stepCount === 1 ? "1 resultado" : `${stepCount} resultados`}
        </span>
        {totalCostUsd > 0 && (
          <span className={styles.total}>
            Costo acumulado ${totalCostUsd.toFixed(4)}
          </span>
        )}
        {/* The editing steps are not gone, they are where they are used. A
            design with five inpaintings and no composition would otherwise
            read as a design where nothing had happened. */}
        {workStepCount > 0 && (
          <Link className={styles.editLink} href={editHref}>
            {workStepCount === 1
              ? "1 paso de edición"
              : `${workStepCount} pasos de edición`}
          </Link>
        )}
        {/* The total leaves out generated model photos on purpose: they live
            in the client's catalogue and are reused across designs, so adding
            one to every design that used it would count it once per design.
            Said here because a total that is quietly partial reads as wrong
            the first time someone adds it up. */}
        {totalCostUsd > 0 && (
          <span className={styles.totalNote}>
            No incluye los modelos generados: se guardan en el catálogo del
            cliente y se reusan entre diseños.
          </span>
        )}
      </div>

      {!originAsset && assets.length === 0 ? (
        <EmptyState
          size="sm"
          title="Todavía no hay resultados"
          hint="Asigna una prenda base para empezar. Las composiciones y las pruebas virtuales que produzcas quedan acá."
        />
      ) : (
        <div className={styles.strip} ref={stripRef}>
          {originAsset && (
            <button
              type="button"
              className={styles.step}
              aria-label="Ver la prenda base en grande"
              onClick={() => setPreview(originAsset)}
            >
              {/* Dashed: the starting point belongs to the client's
                  catalogue, it is not a step of this design. */}
              <Thumbnail src={originAsset.url} alt="Prenda base" provisional />
              <div className={styles.meta}>
                <span className={styles.label}>Punto de partida</span>
                <span className={styles.when}>Prenda base</span>
              </div>
            </button>
          )}

          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={styles.step}
              aria-label={`Ver ${assetTypeLabel(
                asset.asset_type
              ).toLowerCase()} en grande`}
              onClick={() => setPreview(asset)}
            >
              <Thumbnail
                src={asset.url}
                alt={assetTypeLabel(asset.asset_type)}
              />
              <div className={styles.meta}>
                <span className={styles.label}>
                  {assetTypeLabel(asset.asset_type)}
                </span>
                <span className={styles.when}>
                  {dateFormat.format(new Date(asset.created_at))}
                </span>
                {asset.cost_usd !== null && (
                  <span className={styles.cost}>
                    ${asset.cost_usd.toFixed(4)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <AssetPreviewDialog
          asset={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}
