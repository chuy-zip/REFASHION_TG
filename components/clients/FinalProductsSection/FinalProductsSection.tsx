"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import { assetTypeLabel } from "@/lib/assets";
import type { FinalProduct } from "@/lib/assets-server";
import styles from "./FinalProductsSection.module.css";

const dateFormat = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

interface FinalProductsSectionProps {
  products: FinalProduct[];
}

/**
 * Everything this client's designs have finished, in one place.
 *
 * **Why a tab of its own and not part of Recursos.** Recursos is the catalog:
 * things you put IN — base garments, logos, model photos. These are what came
 * OUT. Filing them together would mean a screen whose organising idea is "kinds
 * of file" instead of "input or result", and the upload tiles that make Recursos
 * work would have nothing to do here. The two answer different questions, so
 * they are two places.
 *
 * **Why a masonry and not the grid used elsewhere.** The catalog's uniform grid
 * is right for a catalog: the images are comparable and the user is scanning
 * for one they can name. Results are not comparable — a flat garment, a person
 * wearing it and a generated model have different shapes — and the user is
 * browsing rather than looking something up. Columns let each image keep its
 * own proportions, which is the whole reason this layout reads as a gallery.
 *
 * CSS columns and not a JS masonry: the browser already does this, and a
 * layout that needs measuring would reflow every time a signed URL resolves.
 * The trade is that order runs **down each column** rather than across, which
 * is acceptable here precisely because nobody is comparing positions.
 */
export function FinalProductsSection({ products }: FinalProductsSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const open = products.find((product) => product.id === openId) ?? null;

  if (products.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay productos terminados"
        hint="Cuando un diseño cree una composición o una exportación, aparecerá aquí."
      />
    );
  }

  return (
    <>
      <p className={styles.count}>
        {products.length === 1
          ? "1 producto terminado"
          : `${products.length} productos terminados`}
      </p>

      <div className={styles.gallery}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            className={styles.card}
            onClick={() => setOpenId(product.id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer does not apply */}
            <img
              className={styles.image}
              src={product.url}
              alt={`${product.design_name} v${product.design_version}`}
              crossOrigin="anonymous"
              loading="lazy"
            />
            {/* Under the image and always present, not an overlay on hover:
                a caption that only appears on hover does not exist on touch,
                and the design's name is how anyone recognises which of five
                similar shirts they are looking at. */}
            <span className={styles.caption}>
              <span className={styles.captionName}>{product.design_name}</span>
              <span className={styles.captionMeta}>
                v{product.design_version} · {assetTypeLabel(product.asset_type)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Dialog
        open={open !== null}
        onClose={() => setOpenId(null)}
        labelledBy="final-product-title"
      >
        {open && (
          <div className={styles.detail}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
            <img
              className={styles.detailImage}
              src={open.url}
              alt={`${open.design_name} v${open.design_version}`}
              crossOrigin="anonymous"
            />

            <div className={styles.detailBody}>
              <h2 className={styles.detailTitle} id="final-product-title">
                {open.design_name}
              </h2>

              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt className={styles.factLabel}>Tipo</dt>
                  <dd className={styles.factValue}>
                    {assetTypeLabel(open.asset_type)}
                  </dd>
                </div>
                <div className={styles.fact}>
                  <dt className={styles.factLabel}>Versión</dt>
                  <dd className={styles.factValue}>v{open.design_version}</dd>
                </div>
                <div className={styles.fact}>
                  <dt className={styles.factLabel}>Proyecto</dt>
                  <dd className={styles.factValue}>{open.project_name}</dd>
                </div>
                <div className={styles.fact}>
                  <dt className={styles.factLabel}>Creado</dt>
                  <dd className={styles.factValue}>
                    {dateFormat.format(new Date(open.created_at))}
                  </dd>
                </div>
                {open.width_px && open.height_px && (
                  <div className={styles.fact}>
                    <dt className={styles.factLabel}>Tamaño</dt>
                    <dd className={styles.factValue}>
                      {open.width_px} × {open.height_px} px
                    </dd>
                  </div>
                )}
              </dl>

              <div className={styles.actions}>
                {/* An anchor, not a Button: downloading is a navigation to a
                    file, and the signed URL already carries the filename. */}
                <a
                  className={`${buttonStyles.base} ${buttonStyles.primary}`}
                  href={open.downloadUrl}
                  download
                >
                  Descargar
                </a>
                {/* Where it came from. A result nobody can trace back to the
                    design that made it is a file, not a product. */}
                <Link
                  className={`${buttonStyles.base} ${buttonStyles.secondary}`}
                  href={`/designs/${open.design_id_of}`}
                >
                  Ver el diseño
                </Link>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
