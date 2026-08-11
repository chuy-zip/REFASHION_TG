"use client";

import { useEffect, useRef, useState } from "react";
import { AssetPreviewDialog } from "@/components/assets/AssetPreviewDialog/AssetPreviewDialog";
import { assetTypeLabel, type AssetWithUrl } from "@/lib/assets";
import styles from "./DesignTimeline.module.css";

interface DesignTimelineProps {
  /**
   * The catalog image the design started from, shown as the strip's origin.
   * It is not a step: it belongs to the client, not to the design.
   */
  originAsset: AssetWithUrl | null;
  /** The design's own assets, oldest first (see listDesignAssets). */
  assets: AssetWithUrl[];
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
 */
export function DesignTimeline({ originAsset, assets }: DesignTimelineProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<AssetWithUrl | null>(null);

  const totalCost = assets.reduce((sum, asset) => sum + (asset.cost_usd ?? 0), 0);
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
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Historial</h2>
          <p className={styles.subtitle}>
            Cada paso del diseño, del más antiguo al más reciente. Haz clic en
            uno para verlo en grande o descargarlo.
          </p>
        </div>
        {totalCost > 0 && (
          <span className={styles.total}>
            Costo acumulado ${totalCost.toFixed(4)}
          </span>
        )}
      </div>

      {!originAsset && assets.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Todavía no hay historial</p>
          <p className={styles.emptyHint}>
            Asigna una prenda base para empezar. Cada cambio que hagas queda
            registrado acá y puedes volver a él sin generarlo de nuevo.
          </p>
        </div>
      ) : (
        <div className={styles.strip} ref={stripRef}>
          {originAsset && (
            <button
              type="button"
              className={`${styles.step} ${styles.origin}`}
              onClick={() => setPreview(originAsset)}
            >
              <div className={styles.thumbWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
                <img
                  className={styles.thumb}
                  src={originAsset.url}
                  alt="Prenda base"
                />
              </div>
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
              onClick={() => setPreview(asset)}
            >
              <div className={styles.thumbWrap}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
                <img
                  className={styles.thumb}
                  src={asset.url}
                  alt={assetTypeLabel(asset.asset_type)}
                />
              </div>
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
