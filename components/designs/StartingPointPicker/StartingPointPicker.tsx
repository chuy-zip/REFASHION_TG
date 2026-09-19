"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { Thumbnail } from "@/components/ui/Thumbnail/Thumbnail";
import { ThumbnailGrid } from "@/components/ui/ThumbnailGrid/ThumbnailGrid";
import { UPLOAD_ACCEPT, uploadClientAsset } from "@/lib/asset-upload";
import {
  ASSET_TYPE_COPY,
  assetDisplayName,
  stripExtension,
  type AssetWithUrl,
} from "@/lib/assets";
import { garmentTypeLabel, type DesignWithPreview } from "@/lib/designs";
import styles from "./StartingPointPicker.module.css";

/**
 * What a new design starts from. An asset is a fresh start from the catalog;
 * a design makes the new one an iteration of it (see migration 010).
 */
export type StartingPoint =
  | { kind: "asset"; id: string }
  | { kind: "design"; id: string };

/**
 * What an uploaded file gets filed as.
 *
 * The same three catalog types this panel can start a design from, which is the
 * point: the question is only asked because the answer is now ambiguous. While
 * the only starting point was a flat garment there was nothing to ask.
 */
type UploadType = "base_garment" | "model_photo" | "tech_drawing";

const UPLOAD_TYPES: UploadType[] = ["base_garment", "model_photo", "tech_drawing"];

type Source =
  | "base_garment"
  | "model_photo"
  | "tech_drawing"
  | "design"
  | "upload";

const SOURCE_COPY: Record<Source, { label: string; empty?: string }> = {
  base_garment: {
    label: "Prendas base",
    empty: "Este cliente no tiene prendas base.",
  },
  // A model photo starts a design the same way a flat garment does: it is an
  // image with a garment in it. The catalog type existed since migration 001
  // and objetivo específico 1 names it, but this list never offered it, so the
  // only thing stopping it was these four strings.
  //
  // It is also the better surface for the generative step. Editing measured far
  // better on natural photographs than on product cut-outs over flat white,
  // which is what the experiments in `herramientas/` kept running into.
  model_photo: {
    label: "Fotos de modelo",
    empty: "Este cliente no tiene fotos de modelo.",
  },
  tech_drawing: {
    label: "Dibujos técnicos",
    empty: "Este cliente no tiene dibujos técnicos.",
  },
  design: {
    label: "Diseños existentes",
    empty: "Este proyecto todavía no tiene diseños.",
  },
  upload: { label: "Subir nueva" },
};

interface StartingPointPickerProps {
  /** Owner of the catalog, and where an uploaded image is filed. */
  clientId: string;
  /** Catalog assets of the client; filtered here to the two usable types. */
  assets: AssetWithUrl[];
  /** Designs of the project, offered as iteration parents. */
  designs?: DesignWithPreview[];
  /**
   * Whether starting from an existing design is on the table. False when the
   * picker only assigns a base garment: iterating is a decision made when the
   * design is created, not afterwards.
   */
  includeDesigns?: boolean;
  value: StartingPoint | null;
  onChange: (value: StartingPoint | null) => void;
  /**
   * A freshly uploaded catalog image. The caller owns the asset list, so it is
   * responsible for both adding this to `assets` and selecting it via
   * `onChange` — this component never mutates either behind its back.
   */
  onAssetUploaded: (asset: AssetWithUrl) => void;
}

/**
 * Visual picker for a design's starting point. Replaces a name-only <select>:
 * nobody remembers their catalog by filename, so the choice has to be made on
 * the images themselves.
 *
 * Logos are deliberately absent: a logo is composited *onto* a garment
 * (Módulo 1), never a canvas to start from.
 *
 * **Model photos used to be absent too, on the grounds that one is the VTON
 * target (Módulo 3) rather than a canvas. That reasoning no longer holds.** The
 * generative experiments in `herramientas/` measured editing to work markedly
 * better on natural photographs of someone wearing the garment than on product
 * cut-outs over flat white — which is the opposite of what the exclusion
 * assumed. A model photo is now both: a canvas to edit and, later, a VTON
 * target. Objetivo específico 1 already listed it as a catalog type.
 *
 * "Subir nueva" is a source like the others rather than a button beside them:
 * an empty catalog used to be a dead end that forced a trip to the Recursos
 * tab and back. What it uploads still lands in the client's catalog, so there
 * is no second lifecycle for images that arrived this way.
 */
export function StartingPointPicker({
  clientId,
  assets,
  designs = [],
  includeDesigns = true,
  value,
  onChange,
  onAssetUploaded,
}: StartingPointPickerProps) {
  const fieldId = useId();
  const [source, setSource] = useState<Source>("base_garment");

  const [uploadType, setUploadType] = useState<UploadType>("base_garment");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const sources: Source[] = includeDesigns
    ? ["base_garment", "model_photo", "tech_drawing", "design", "upload"]
    : ["base_garment", "model_photo", "tech_drawing", "upload"];

  const assetsOfSource = (type: Source) =>
    assets.filter((asset) => asset.asset_type === type);

  const counts: Partial<Record<Source, number>> = {
    base_garment: assetsOfSource("base_garment").length,
    model_photo: assetsOfSource("model_photo").length,
    tech_drawing: assetsOfSource("tech_drawing").length,
    design: designs.length,
  };

  const visibleAssets =
    source === "design" || source === "upload" ? [] : assetsOfSource(source);

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

  /**
   * Uploads as soon as a file is picked, with no confirm button.
   *
   * There used to be one, and it was a trap: picking the file already *is* the
   * decision, so a second button only asks the user to confirm something they
   * already chose. People pressed "Siguiente" with a file selected and never
   * uploaded, losing it in silence. A button whose only job is to confirm a
   * decision already made is the kind that gets forgotten.
   *
   * The name is taken from the file. Renaming lives in the client's Recursos
   * tab, which already does it, rather than adding a second thing to press.
   */
  async function handleFileChange(file: File | null) {
    if (!file) return;

    setUploadError(null);
    setIsUploading(true);

    // Filed as whatever the tabs above say, not guessed from the file. It used
    // to be hard-coded to `base_garment`, which was right while that was the
    // only thing a design could start from — and became wrong the moment model
    // photos became one, because a photo of a person would land under
    // "Prendas base" and the catalog would slowly fill with mislabelled images.
    //
    // The choice sits next to the file input and defaults to the common case,
    // so the flow keeps its one gesture for anyone who does not care.
    const result = await uploadClientAsset({
      clientId,
      assetType: uploadType,
      file,
      baseName: stripExtension(file.name),
    });

    setIsUploading(false);

    if (!result.ok) {
      setUploadError(result.error);
      return;
    }

    onAssetUploaded(result.data);
    // Land on the tab where it now lives, whichever that is. The selection bar
    // below then names it, which is the confirmation that the upload worked.
    setSource(uploadType);
  }

  return (
    <div className={styles.picker}>
      <PillTabs
        label="Origen del diseño"
        selected={source}
        onSelect={(key) => setSource(key as Source)}
        options={sources.map((key) => ({
          key,
          label: SOURCE_COPY[key].label,
          count: counts[key],
        }))}
      />

      {source === "upload" ? (
        <div className={styles.upload}>
          {uploadError && (
            <p className={styles.uploadError} role="alert">
              {uploadError}
            </p>
          )}

          <div className={styles.uploadField}>
            <span className={styles.uploadLabel}>Qué es</span>
            <PillTabs
              label="Tipo de imagen"
              selected={uploadType}
              onSelect={(key) => setUploadType(key as UploadType)}
              options={UPLOAD_TYPES.map((key) => ({
                key,
                label: ASSET_TYPE_COPY[key].label,
              }))}
            />
          </div>

          <div className={styles.uploadField}>
            <label className={styles.uploadLabel} htmlFor={`${fieldId}-file`}>
              Archivo
            </label>
            <input
              id={`${fieldId}-file`}
              className={styles.uploadInput}
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={(event) =>
                handleFileChange(event.target.files?.[0] ?? null)
              }
              disabled={isUploading}
            />
            <p className={styles.uploadHint}>
              PNG, JPEG o WEBP. Máximo 10 MB. Se sube al elegirla y queda en el
              catálogo del cliente como{" "}
              {ASSET_TYPE_COPY[uploadType].label.toLowerCase()}.
            </p>
          </div>

          {isUploading && (
            <p className={styles.uploadStatus} role="status">
              Subiendo la imagen…
            </p>
          )}
        </div>
      ) : (
        <div className={styles.scroll}>
          <ThumbnailGrid
            isEmpty={
              source === "design"
                ? designs.length === 0
                : visibleAssets.length === 0
            }
            emptyTitle={SOURCE_COPY[source].empty ?? ""}
          >
            {source === "design"
              ? designs.map((design) => (
                  <button
                    key={design.id}
                    type="button"
                    className={styles.card}
                    aria-pressed={
                      value?.kind === "design" && value.id === design.id
                    }
                    onClick={() => toggle({ kind: "design", id: design.id })}
                  >
                    <Thumbnail
                      src={design.preview_url}
                      alt={design.name}
                      corners="top"
                    />
                    <div className={styles.meta}>
                      <span className={styles.name}>{design.name}</span>
                      <span className={styles.sub}>
                        {garmentTypeLabel(design.garment_type)} · v
                        {design.version}
                      </span>
                    </div>
                  </button>
                ))
              : visibleAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className={styles.card}
                    aria-pressed={
                      value?.kind === "asset" && value.id === asset.id
                    }
                    onClick={() => toggle({ kind: "asset", id: asset.id })}
                  >
                    <Thumbnail
                      src={asset.url}
                      alt={assetDisplayName(asset)}
                      corners="top"
                    />
                    <div className={styles.meta}>
                      <span className={`${styles.name} ${styles.filename}`}>
                        {assetDisplayName(asset)}
                      </span>
                    </div>
                  </button>
                ))}
          </ThumbnailGrid>
        </div>
      )}

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
