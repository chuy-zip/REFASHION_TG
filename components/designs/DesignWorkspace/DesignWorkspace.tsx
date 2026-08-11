"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import { uploadDesignAsset } from "@/lib/asset-upload";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import type { DesignLayer } from "@/lib/types";
import {
  useCrossOriginImage,
  useCrossOriginImages,
  type LoadedImage,
} from "./useCrossOriginImage";
import styles from "./DesignWorkspace.module.css";

/** A layer plus everything needed to draw it. */
export interface WorkspaceLayer extends DesignLayer {
  url: string;
  name: string;
}

interface DesignWorkspaceProps {
  designId: string;
  designName: string;
  /** The clean garment the composition sits on. Null when none is assigned. */
  workingImageUrl: string | null;
  /** Lineage parent for the exported composition (objetivo específico 2). */
  workingAssetId: string | null;
  logos: AssetWithUrl[];
  initialLayers: WorkspaceLayer[];
  canEdit: boolean;
}

/** Fraction of the garment width a freshly placed logo takes. */
const DEFAULT_WIDTH_RATIO = 0.25;

/**
 * Each new layer lands slightly off the previous one. Without this they stack
 * exactly (both default to the centre) and the second one looks like it was
 * never added. Wraps so a long session does not walk a logo off the garment.
 */
const CASCADE_STEP = 0.04;
const CASCADE_WRAP = 5;

/**
 * Konva paints on a canvas, so it takes colour values and not CSS variables.
 * Reading the token keeps `globals.css` the single source of truth instead of
 * hardcoding a second palette inside the drawing code.
 */
function designToken(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Módulo 1: composing logos over the design's working image.
 *
 * The canvas works in the **natural pixel space of the working image** and CSS
 * scales it down to fit. That is what makes the ratios in `design_layers` mean
 * something: computed against the on-screen size they would drift with the
 * width of the window, and a logo placed perfectly would land somewhere else on
 * the export.
 *
 * Layers autosave on gesture end. There is no "Guardar composición" button on
 * purpose: a control whose only job is to confirm a decision already made is
 * the one that gets forgotten (see FASE_1_5 §6.4).
 */
export function DesignWorkspace({
  designId,
  designName,
  workingImageUrl,
  workingAssetId,
  logos,
  initialLayers,
  canEdit,
}: DesignWorkspaceProps) {
  const router = useRouter();
  const { notify } = useToast();

  const [layers, setLayers] = useState<WorkspaceLayer[]>(initialLayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Image>());

  const [availableWidth, setAvailableWidth] = useState(0);

  const { image: workingImage, status: workingStatus } =
    useCrossOriginImage(workingImageUrl);

  // Loaded here, in ordinary React, and handed to the canvas as finished
  // elements. Nothing under <Stage> loads anything.
  const layerImages = useCrossOriginImages(layers.map((layer) => layer.url));

  const naturalWidth = workingImage?.naturalWidth ?? 0;
  const naturalHeight = workingImage?.naturalHeight ?? 0;

  // Fit to the column, never upscale: a small garment image blown up would
  // look sharp on the stage and blurry on the export, which is a lie.
  const scale =
    naturalWidth > 0 && availableWidth > 0
      ? Math.min(availableWidth / naturalWidth, 1)
      : 0;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Konva's Transformer is attached imperatively, so it has to follow the
  // selection by hand. Hidden while exporting: otherwise the handles get baked
  // into the PNG.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;

    const node = selectedId ? nodeRefs.current.get(selectedId) : undefined;
    transformer.nodes(node && !isExporting ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, isExporting, layers]);

  const persistGeometry = useCallback(
    async (layerId: string, geometry: Partial<DesignLayer>) => {
      const result = await apiPatch<DesignLayer>(
        `/api/designs/${designId}/layers/${layerId}`,
        geometry
      );
      if (!result.ok) setError(result.error);
    },
    [designId]
  );

  async function handleAddLogo(logo: AssetWithUrl) {
    setError(null);
    setIsBusy(true);

    const offset = (layers.length % CASCADE_WRAP) * CASCADE_STEP;

    const result = await apiPost<DesignLayer>(
      `/api/designs/${designId}/layers`,
      {
        asset_id: logo.id,
        width_ratio: DEFAULT_WIDTH_RATIO,
        x_ratio: 0.5 + offset,
        y_ratio: 0.5 + offset,
      }
    );

    setIsBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const created: WorkspaceLayer = {
      ...result.data,
      url: logo.url,
      name: assetDisplayName(logo),
    };
    setLayers((current) => [...current, created]);
    setSelectedId(created.id);
  }

  async function handleRemoveLayer(layerId: string) {
    setError(null);
    const previous = layers;

    // Optimistic: the canvas should not lag behind the click.
    setLayers((current) => current.filter((layer) => layer.id !== layerId));
    if (selectedId === layerId) setSelectedId(null);
    nodeRefs.current.delete(layerId);

    const result = await apiDelete(
      `/api/designs/${designId}/layers/${layerId}`
    );

    if (!result.ok) {
      setLayers(previous);
      setError(result.error);
    }
  }

  function handleDragEnd(layer: WorkspaceLayer, node: Konva.Image) {
    const geometry = {
      x_ratio: node.x() / naturalWidth,
      y_ratio: node.y() / naturalHeight,
    };
    setLayers((current) =>
      current.map((item) =>
        item.id === layer.id ? { ...item, ...geometry } : item
      )
    );
    void persistGeometry(layer.id, geometry);
  }

  function handleTransformEnd(layer: WorkspaceLayer, node: Konva.Image) {
    // The Transformer reports its result as a scale on the node. Fold it back
    // into the width and reset the scale, or it compounds on the next gesture.
    const nextWidth = node.width() * node.scaleX();
    node.scaleX(1);
    node.scaleY(1);

    const geometry = {
      x_ratio: node.x() / naturalWidth,
      y_ratio: node.y() / naturalHeight,
      width_ratio: nextWidth / naturalWidth,
      rotation_deg: node.rotation(),
    };

    setLayers((current) =>
      current.map((item) =>
        item.id === layer.id ? { ...item, ...geometry } : item
      )
    );
    void persistGeometry(layer.id, geometry);
  }

  async function handleExport() {
    const stage = stageRef.current;
    if (!stage || !workingImage) return;

    setError(null);
    setSelectedId(null);
    setIsExporting(true);

    // Let the deselection paint before grabbing pixels, so the transformer
    // handles are gone from the bitmap.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let blob: Blob | null = null;
    try {
      // pixelRatio undoes the display scale: the export comes out at the
      // working image's real resolution, not at whatever fits on screen.
      // Konva types toBlob as `unknown`; it resolves to a Blob.
      blob = (await stage.toBlob({
        mimeType: "image/png",
        pixelRatio: scale > 0 ? 1 / scale : 1,
      })) as Blob | null;
    } catch {
      setIsExporting(false);
      setError(
        "No se pudo exportar la composición. La imagen no permitió leer el lienzo."
      );
      return;
    }

    if (!blob) {
      setIsExporting(false);
      setError("No se pudo exportar la composición.");
      return;
    }

    const result = await uploadDesignAsset({
      designId,
      assetType: "composition",
      blob,
      baseName: `${designName} composicion`,
      // The image this one came out of. Without it objetivo específico 2 has
      // no evidence (FASE_1_5 §3, B3).
      parentAssetId: workingAssetId,
    });

    setIsExporting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    notify({ type: "success", message: "Composición creada." });
    // The composition is a render, not a step: it deliberately does NOT become
    // the working image (§7.7). Refresh only so the history picks it up.
    router.refresh();
  }

  const stageWidth = naturalWidth * scale;
  const stageHeight = naturalHeight * scale;
  const canCompose = canEdit && workingStatus === "loaded";

  return (
    <div className={styles.workspace}>
      <div className={styles.canvasColumn} ref={containerRef}>
        <div className={styles.stageBox}>
          {!workingImageUrl ? (
            <div className={styles.stageMessage}>
              <p className={styles.stageMessageTitle}>Sin prenda base todavía</p>
              <p className={styles.stageMessageHint}>
                Elige una prenda base para empezar a componer.
              </p>
            </div>
          ) : workingStatus === "error" ? (
            <div className={styles.stageMessage}>
              <p className={styles.stageMessageTitle}>
                No se pudo cargar la imagen
              </p>
              <p className={styles.stageMessageHint}>
                Recarga la página. Si persiste, la imagen pudo haberse
                eliminado del catálogo.
              </p>
            </div>
          ) : workingStatus !== "loaded" || scale === 0 ? (
            <p className={styles.status}>Cargando el lienzo…</p>
          ) : (
            <Stage
              ref={stageRef}
              width={stageWidth}
              height={stageHeight}
              scaleX={scale}
              scaleY={scale}
              onMouseDown={(event) => {
                // Clicking the garment itself clears the selection.
                if (event.target === event.target.getStage()) setSelectedId(null);
              }}
            >
              <Layer listening={false}>
                <KonvaImage
                  image={workingImage ?? undefined}
                  width={naturalWidth}
                  height={naturalHeight}
                />
              </Layer>
              <Layer>
                {layers.map((layer) => (
                  <LayerNode
                    key={layer.id}
                    layer={layer}
                    image={layerImages[layer.url]}
                    naturalWidth={naturalWidth}
                    naturalHeight={naturalHeight}
                    draggable={canCompose}
                    onSelect={() => canCompose && setSelectedId(layer.id)}
                    onDragEnd={handleDragEnd}
                    onTransformEnd={handleTransformEnd}
                    registerNode={(node) => {
                      if (node) nodeRefs.current.set(layer.id, node);
                      else nodeRefs.current.delete(layer.id);
                    }}
                  />
                ))}
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  keepRatio
                  enabledAnchors={[
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                  ]}
                  boundBoxFunc={(oldBox, newBox) =>
                    newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
                  }
                />
              </Layer>
            </Stage>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.group}>
          <span className={styles.groupLabel}>Logotipos</span>
          {logos.length === 0 ? (
            <p className={styles.hint}>
              Este cliente no tiene logotipos. Súbelos desde la pestaña Recursos
              para poder colocarlos.
            </p>
          ) : (
            <div className={styles.logoRow}>
              {logos.map((logo) => (
                <button
                  key={logo.id}
                  type="button"
                  className={styles.logoButton}
                  onClick={() => handleAddLogo(logo)}
                  disabled={!canCompose || isBusy}
                  title={assetDisplayName(logo)}
                >
                  {/*
                    crossOrigin is NOT decoration here. The canvas loads this
                    exact URL as a CORS request; if this thumbnail fetches it
                    first without CORS, R2 answers without an
                    Access-Control-Allow-Origin header (no Origin was sent),
                    the browser caches that response, and the canvas then
                    reuses it and is blocked. Same URL, two request modes, one
                    poisoned cache entry. Both must ask the same way.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
                  <img
                    className={styles.logoThumb}
                    src={logo.url}
                    alt={assetDisplayName(logo)}
                    crossOrigin="anonymous"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Capas</span>
          {layers.length === 0 ? (
            <p className={styles.hint}>
              Todavía no hay capas. Elige un logotipo para colocarlo sobre la
              prenda.
            </p>
          ) : (
            <ul className={styles.layerList}>
              {[...layers]
                .sort((a, b) => b.z_index - a.z_index)
                .map((layer) => (
                  <li key={layer.id} className={styles.layerItem}>
                    <button
                      type="button"
                      className={`${styles.layerName} ${
                        selectedId === layer.id ? styles.layerSelected : ""
                      }`}
                      onClick={() => setSelectedId(layer.id)}
                      title={
                        layerImages[layer.url] === "error"
                          ? "La imagen de esta capa no se pudo cargar."
                          : layer.name
                      }
                    >
                      {layer.name}
                      {layerImages[layer.url] === "error"
                        ? " · no cargó"
                        : ""}
                    </button>
                    <Button
                      variant="ghost"
                      onClick={() => handleRemoveLayer(layer.id)}
                      disabled={!canEdit}
                      title="Quitar la capa (el logotipo sigue en el catálogo)"
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Composición</span>
          {/*
            Deliberately not "Guardar": the layers are already saved, and a
            button labelled "save" made people expect unsaved work that does
            not exist. This one *produces a file* — the flattened image the
            client sees and the virtual try-on consumes.
          */}
          <p className={styles.hint}>
            Los logotipos ya quedaron guardados en el diseño. Esto crea una
            imagen con ellos aplicados, para descargarla o usarla en la prueba
            virtual.
          </p>
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={!canCompose || layers.length === 0 || isExporting}
          >
            {isExporting ? "Creando…" : "Crear composición"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface LayerNodeProps {
  layer: WorkspaceLayer;
  /** Already loaded by the parent, outside the Konva tree. */
  image: LoadedImage;
  naturalWidth: number;
  naturalHeight: number;
  draggable: boolean;
  onSelect: () => void;
  onDragEnd: (layer: WorkspaceLayer, node: Konva.Image) => void;
  onTransformEnd: (layer: WorkspaceLayer, node: Konva.Image) => void;
  registerNode: (node: Konva.Image | null) => void;
}

/**
 * One logo on the canvas. Ratios become pixels here and nowhere else.
 *
 * Holds no state and loads nothing: it receives a finished image and draws it.
 * Everything under `<Stage>` goes through react-konva's own reconciler, and a
 * node that also owned its loading was the hardest possible place to find out
 * why nothing appeared.
 *
 * The anchor is the centre (`offset` at half the size), matching how the
 * geometry is stored: rotating or scaling then pivots around the middle and
 * leaves the logo where the user put it.
 */
function LayerNode({
  layer,
  image,
  naturalWidth,
  naturalHeight,
  draggable,
  onSelect,
  onDragEnd,
  onTransformEnd,
  registerNode,
}: LayerNodeProps) {
  const width = layer.width_ratio * naturalWidth;
  const x = layer.x_ratio * naturalWidth;
  const y = layer.y_ratio * naturalHeight;

  // A layer whose image did not load used to render nothing at all, which made
  // a broken layer and a missing layer look identical. A placeholder says what
  // happened and keeps the layer selectable so it can be removed.
  if (image === "error") {
    const height = width * 0.6;
    return (
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        offsetX={width / 2}
        offsetY={height / 2}
        rotation={layer.rotation_deg}
        stroke={designToken("--color-danger")}
        strokeWidth={2}
        dash={[8, 6]}
        onMouseDown={onSelect}
        onTap={onSelect}
      />
    );
  }

  if (!image) return null;

  const height = width * (image.naturalHeight / image.naturalWidth);

  return (
    <KonvaImage
      ref={registerNode}
      image={image}
      x={x}
      y={y}
      width={width}
      height={height}
      offsetX={width / 2}
      offsetY={height / 2}
      rotation={layer.rotation_deg}
      draggable={draggable}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragEnd={(event) => onDragEnd(layer, event.target as Konva.Image)}
      onTransformEnd={(event) =>
        onTransformEnd(layer, event.target as Konva.Image)
      }
    />
  );
}
