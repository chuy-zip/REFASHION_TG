"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { ThumbnailGrid } from "@/components/ui/ThumbnailGrid/ThumbnailGrid";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import { garmentTypeLabel, type DesignOption } from "@/lib/designs";
import styles from "./StartingPointPicker.module.css";

/**
 * What a new design starts from. An asset is a fresh start from the catalog;
 * a design makes the new one an iteration of it (see migration 010).
 */
export type StartingPoint =
  | { kind: "asset"; id: string }
  | { kind: "design"; id: string };

type Source = "base_garment" | "tech_drawing" | "design";

const SOURCE_COPY: Record<Source, { label: string; empty: string }> = {
  base_garment: {
    label: "Prendas base",
    empty: "Este cliente no tiene prendas base.",
  },
  tech_drawing: {
    label: "Dibujos técnicos",
    empty: "Este cliente no tiene dibujos técnicos.",
  },
  design: {
    label: "Diseños existentes",
    empty: "Este proyecto todavía no tiene diseños.",
  },
};

const SOURCES: Source[] = ["base_garment", "tech_drawing", "design"];

interface StartingPointPickerProps {
  /** Catalog assets of the client; filtered here to the two usable types. */
  assets: AssetWithUrl[];
  /** Designs of the project, offered as iteration parents. */
  designs: DesignOption[];
  value: StartingPoint | null;
  onChange: (value: StartingPoint | null) => void;
}

/**
 * Visual picker for a design's starting point. Replaces a name-only <select>:
 * nobody remembers their catalog by filename, so the choice has to be made on
 * the images themselves.
 *
 * Logos and model photos are deliberately absent — a logo is composited *onto*
 * a garment (Módulo 1) and a model photo is the VTON target (Módulo 3);
 * neither is a canvas to start from.
 */
export function StartingPointPicker({
  assets,
  designs,
  value,
  onChange,
}: StartingPointPickerProps) {
  const [source, setSource] = useState<Source>("base_garment");

  const assetsOfSource = (type: Source) =>
    assets.filter((asset) => asset.asset_type === type);

  const counts: Record<Source, number> = {
    base_garment: assetsOfSource("base_garment").length,
    tech_drawing: assetsOfSource("tech_drawing").length,
    design: designs.length,
  };

  const visibleAssets = source === "design" ? [] : assetsOfSource(source);
  const copy = SOURCE_COPY[source];

  const selectedLabel = (() => {
    if (!value) return null;
    if (value.kind === "asset") {
      const asset = assets.find((candidate) => candidate.id === value.id);
      return asset ? assetDisplayName(asset) : null;
    }
    const design = designs.find((candidate) => candidate.id === value.id);
    return design ? `${design.name} · v${design.version}` : null;
  })();

  function toggle(next: StartingPoint) {
    const isSame = value?.kind === next.kind && value.id === next.id;
    onChange(isSame ? null : next);
  }

  return (
    <div className={styles.picker}>
      <PillTabs
        label="Origen del diseño"
        selected={source}
        onSelect={(key) => setSource(key as Source)}
        options={SOURCES.map((key) => ({
          key,
          label: SOURCE_COPY[key].label,
          count: counts[key],
        }))}
      />

      <div className={styles.scroll}>
        <ThumbnailGrid
          isEmpty={
            source === "design" ? designs.length === 0 : visibleAssets.length === 0
          }
          emptyTitle={copy.empty}
        >
          {source === "design"
            ? designs.map((design) => (
                <button
                  key={design.id}
                  type="button"
                  className={styles.card}
                  aria-pressed={value?.kind === "design" && value.id === design.id}
                  onClick={() => toggle({ kind: "design", id: design.id })}
                >
                  <div className={styles.thumbWrap}>
                    {design.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply
                      <img
                        className={styles.thumb}
                        src={design.previewUrl}
                        alt={design.name}
                      />
                    ) : (
                      <span className={styles.noThumb}>Sin imagen</span>
                    )}
                  </div>
                  <div className={styles.meta}>
                    <span className={styles.name}>{design.name}</span>
                    <span className={styles.sub}>
                      {garmentTypeLabel(design.garment_type)} · v{design.version}
                    </span>
                  </div>
                </button>
              ))
            : visibleAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className={styles.card}
                  aria-pressed={value?.kind === "asset" && value.id === asset.id}
                  onClick={() => toggle({ kind: "asset", id: asset.id })}
                >
                  <div className={styles.thumbWrap}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
                    <img
                      className={styles.thumb}
                      src={asset.url}
                      alt={assetDisplayName(asset)}
                    />
                  </div>
                  <div className={styles.meta}>
                    <span className={`${styles.name} ${styles.filename}`}>
                      {assetDisplayName(asset)}
                    </span>
                  </div>
                </button>
              ))}
        </ThumbnailGrid>
      </div>

      <div className={styles.selection}>
        <span>
          {selectedLabel ? (
            <>
              Seleccionado:{" "}
              <span className={styles.selectionValue}>{selectedLabel}</span>
            </>
          ) : (
            "Sin punto de partida. El lienzo empieza vacío."
          )}
        </span>
        {value && (
          <Button variant="ghost" onClick={() => onChange(null)}>
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}
