"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { SearchInput } from "@/components/ui/SearchInput/SearchInput";
import { RenameAssetDialog } from "@/components/assets/RenameAssetDialog/RenameAssetDialog";
import { assetTitle, assetTypeLabel } from "@/lib/assets";
import type { FinalProduct, Presentation } from "@/lib/assets-server";
import styles from "./FinalProductsSection.module.css";

const dateFormat = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

interface FinalProductsSectionProps {
  products: FinalProduct[];
  /**
   * Owner, editor or admin. A read-only member sees and downloads the products
   * but was offered "Renombrar", which the database then refused.
   */
  canEdit: boolean;
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
/**
 * Las tres presentaciones del objetivo específico 3, con su nombre en pantalla.
 *
 * **Esto es lo que el objetivo pide demostrar**, y hasta ahora estaba guardado
 * pero invisible: dos de las tres se almacenan como `vton` y la galería las
 * mostraba iguales. La diferencia no es el tipo, es de quién era la persona, y
 * `assets-server` la resuelve leyendo el origen de la foto que se usó.
 *
 * El orden es el del objetivo, no el de frecuencia: plana, sobre foto del
 * cliente, sobre modelo generado.
 */
const PRESENTACIONES: { key: Presentation; label: string }[] = [
  { key: "plana", label: "Prenda plana" },
  { key: "foto_cliente", label: "Sobre modelo" },
  { key: "modelo_ia", label: "Sobre modelo IA" },
];

const ETIQUETA = new Map(PRESENTACIONES.map((p) => [p.key, p.label]));

export function FinalProductsSection({
  products,
  canEdit,
}: FinalProductsSectionProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");

  const open = products.find((product) => product.id === openId) ?? null;
  const renaming = products.find((product) => product.id === renameId) ?? null;

  // Solo los tipos que este cliente tiene de verdad: una pestaña que siempre
  // devuelve cero es una pestaña que enseña a no usar el filtro.
  const presentes = PRESENTACIONES.filter((p) =>
    products.some((product) => product.presentation === p.key)
  );

  const termino = busqueda.trim().toLowerCase();
  const visibles = products.filter((product) => {
    if (tipo !== "todos" && product.presentation !== tipo) return false;
    if (!termino) return true;
    // Sobre el nombre propio y el del diseño: quien busca se acuerda de uno de
    // los dos, y no sabe cuál de ellos escribió.
    const campos = [
      assetTitle(product) ?? "",
      product.design_name,
      product.project_name,
    ];
    return campos.some((campo) => campo.toLowerCase().includes(termino));
  });

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
      {presentes.length > 1 && (
        <div className={styles.filters}>
          <PillTabs
            label="Presentación"
            selected={tipo}
            onSelect={setTipo}
            options={[
              { key: "todos", label: "Todas" },
              ...presentes.map((p) => ({ key: p.key, label: p.label })),
            ]}
          />
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            scope="productos terminados"
          />
        </div>
      )}

      <p className={styles.count}>
        {visibles.length === products.length
          ? products.length === 1
            ? "1 producto terminado"
            : `${products.length} productos terminados`
          : `${visibles.length} de ${products.length}`}
      </p>

      <div className={styles.gallery}>
        {visibles.map((product) => (
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
              {/* El nombre propio manda cuando existe. Sin él, el del diseño,
                  que es lo que había antes: cuatro pruebas del mismo diseño se
                  veían idénticas y no había forma de distinguirlas. */}
              <span className={styles.captionName}>
                {assetTitle(product) ?? product.design_name}
              </span>
              <span className={styles.captionMeta}>
                v{product.design_version} ·{" "}
                {/* La presentación, que es lo que el objetivo distingue. El
                    tipo de archivo queda de respaldo para lo que no es una de
                    las tres, como una persona borrada del catálogo. */}
                {(product.presentation && ETIQUETA.get(product.presentation)) ??
                  assetTypeLabel(product.asset_type)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Dialog
        open={open !== null}
        onClose={() => setOpenId(null)}
        labelledBy="final-product-title"
        closeOnBackdrop
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
                {assetTitle(open) ?? open.design_name}
              </h2>

              <dl className={styles.facts}>
                <div className={styles.fact}>
                  <dt className={styles.factLabel}>Presentación</dt>
                  <dd className={styles.factValue}>
                    {(open.presentation && ETIQUETA.get(open.presentation)) ??
                      assetTypeLabel(open.asset_type)}
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

              {/* Two groups, as in the catalog preview: what you can do with
                  the product on the left, and on the right Cerrar with the
                  main action last, where the eye ends. */}
              <div className={styles.actions}>
                {/* Renombrar vive acá y no en la tarjeta: es donde se está
                    mirando el producto de cerca y donde se nota que cuatro
                    pruebas del mismo diseño necesitan nombres. Reusa el mismo
                    diálogo del catálogo, que ya sabe conservar la extensión a
                    partir del tipo guardado. */}
                {canEdit && (
                  <button
                    type="button"
                    className={`${buttonStyles.base} ${buttonStyles.secondary}`}
                    onClick={() => setRenameId(open.id)}
                  >
                    Renombrar
                  </button>
                )}
                {/* Where it came from. A result nobody can trace back to the
                    design that made it is a file, not a product. */}
                <Link
                  className={`${buttonStyles.base} ${buttonStyles.secondary}`}
                  href={`/designs/${open.design_id_of}`}
                >
                  Ver el diseño
                </Link>
                <span className={styles.actionsEnd}>
                  <Button variant="secondary" onClick={() => setOpenId(null)}>
                    Cerrar
                  </Button>
                  {/* An anchor, not a Button: downloading is a navigation to a
                      file, and the signed URL already carries the filename. */}
                  <a
                    className={`${buttonStyles.base} ${buttonStyles.primary}`}
                    href={open.downloadUrl}
                    download
                  >
                    Descargar
                  </a>
                </span>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Montado aparte y no dentro del diálogo de detalle: dos `<dialog>`
          anidados se cierran en cascada, que fue un defecto real de este
          proyecto y se arregló en el componente `Dialog`. Aun así, dos
          diálogos hermanos son más simples de leer que dos anidados. */}
      {renaming && (
        <RenameAssetDialog
          asset={renaming}
          onClose={() => setRenameId(null)}
        />
      )}
    </>
  );
}
