"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import { Button } from "@/components/ui/Button/Button";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { MaskTools, type MaskTool } from "@/components/designs/MaskTools/MaskTools";
import { ColorPanel } from "@/components/designs/ColorPanel/ColorPanel";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import {
  uploadAcceptFor,
  uploadClientAsset,
  uploadDerivedClientAsset,
  uploadDesignAsset,
} from "@/lib/asset-upload";
import {
  assetDisplayName,
  stripExtension,
  type AssetWithUrl,
} from "@/lib/assets";
import {
  DEFAULT_TOLERANCE,
  MAX_TOLERANCE,
  hasTransparentBackground,
  removeBackground,
  toPngBlob,
  type BackgroundRemoval,
} from "@/lib/background-removal";
import { DEFAULT_BRUSH, isMaskEmpty, rasterizeMask, type MaskStroke } from "@/lib/mask";
import { parseHex, recolorRegion } from "@/lib/recolor";
import type { DesignLayer } from "@/lib/types";
import {
  useCrossOriginImage,
  useCrossOriginImages,
  type LoadedImage,
} from "./useCrossOriginImage";
import { MaskLayer } from "./MaskLayer";
import styles from "./DesignWorkspace.module.css";

/** A layer plus everything needed to draw it. */
export interface WorkspaceLayer extends DesignLayer {
  url: string;
  name: string;
}

interface DesignWorkspaceProps {
  designId: string;
  designName: string;
  /** Whose catalog the logos come from, and where new ones are written. */
  clientId: string;
  /** The clean garment the composition sits on. Null when none is assigned. */
  workingImageUrl: string | null;
  /** Lineage parent for the exported composition (objetivo específico 2). */
  workingAssetId: string | null;
  logos: AssetWithUrl[];
  initialLayers: WorkspaceLayer[];
  canEdit: boolean;
}

/** What a layer draws: the logo as it arrived, or a live cut-out preview. */
type LayerImage = LoadedImage | HTMLCanvasElement;

/** Which module currently owns the canvas. */
type WorkspaceMode = "logos" | "mask";

/** Fraction of the garment width a freshly placed logo takes. */
const DEFAULT_WIDTH_RATIO = 0.25;

/**
 * A range input fires on every step of a drag, and each recompute walks the
 * whole bitmap. One frame of grace collapses the burst into a single pass.
 */
const PREVIEW_DEBOUNCE_MS = 80;

/** Past this share removed, the tolerance is eating the logo, not the background. */
const OVERCUT_SHARE = 0.9;

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
  clientId,
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

  // Logos created without leaving the screen: uploaded from here, or produced
  // by removing a background. `router.refresh()` brings them into the `logos`
  // prop eventually; holding them locally means the row updates on the click
  // instead of on the round trip.
  const [ownLogos, setOwnLogos] = useState<AssetWithUrl[]>([]);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Background removal, live on the canvas until it is applied or dropped.
  const [cutLayerId, setCutLayerId] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);
  // Tagged with the layer it belongs to, and matched at render time. A result
  // that arrives after the user moved on is then simply not the current one,
  // instead of having to be cleared from inside the effect that produced it.
  const [cutPreview, setCutPreview] = useState<{
    layerId: string;
    removal: BackgroundRemoval;
  } | null>(null);
  const [isApplyingCut, setIsApplyingCut] = useState(false);

  // Which module has the canvas. One route with tool modes, not two screens:
  // the stage, the R2 loading, the zoom and the export are built once and
  // shared (FASE_1_5 §7.5). The logo layer draws in BOTH modes, because
  // deciding a colour without seeing the logo on it is deciding blind.
  const [mode, setMode] = useState<WorkspaceMode>("logos");

  // The mask, kept as strokes in ratio space so it survives the working image
  // changing size along the pipeline (see lib/mask.ts).
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [tool, setTool] = useState<MaskTool>("brush");
  const [brush, setBrush] = useState<number>(DEFAULT_BRUSH);
  const isPainting = useRef(false);

  // The colour starts on the accent rather than on a literal: any hex written
  // here would be a second palette living outside globals.css (§5.1). It is
  // only a starting point — the first thing the user does is move it.
  const [color, setColor] = useState<string>(() =>
    designToken("--color-accent")
  );
  // The recoloured garment, live on the canvas until it is applied or dropped.
  // Same shape as the background-removal preview: a proposal, not the design.
  //
  // Tagged with what produced it — the exact strokes array and the exact colour
  // — and matched at render. That is the third time this project needs the
  // pattern (APRENDIZAJES §5.14): an effect that clears state synchronously is
  // both a lint error and a race, because a result arriving after the user
  // moved on would otherwise have to be cancelled from inside the effect that
  // produced it. Here it is simply not the current one.
  const [recolorPreview, setRecolorPreview] = useState<{
    strokes: MaskStroke[];
    color: string;
    canvas: HTMLCanvasElement;
  } | null>(null);
  const [isApplyingColor, setIsApplyingColor] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Image>());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Both dimensions, not just the width. The stage has to fit the box it is
  // given, and that box now has a definite height: measuring only the width let
  // a tall garment run past the bottom edge with nowhere to scroll to.
  const [available, setAvailable] = useState({ width: 0, height: 0 });

  const { image: workingImage, status: workingStatus } =
    useCrossOriginImage(workingImageUrl);

  // Loaded here, in ordinary React, and handed to the canvas as finished
  // elements. Nothing under <Stage> loads anything.
  const layerImages = useCrossOriginImages(layers.map((layer) => layer.url));

  // What the picker offers: the catalog as the server sent it, plus anything
  // made here that has not come back around yet. Keyed by id so a refresh in
  // flight cannot show the same logo twice.
  const availableLogos = useMemo(() => {
    const known = new Set(logos.map((logo) => logo.id));
    return [...logos, ...ownLogos.filter((logo) => !known.has(logo.id))];
  }, [logos, ownLogos]);

  const selectedLayer =
    layers.find((layer) => layer.id === selectedId) ?? null;
  const selectedImage = selectedLayer
    ? layerImages[selectedLayer.url]
    : undefined;
  const isCutting = cutLayerId !== null;

  /**
   * Step 1 of §6.3: a logo that already comes cut out has nothing to remove,
   * so the tool is not offered for it. Cheap enough to run on selection — it
   * reads the border ring, not the whole bitmap.
   */
  const selectedIsCutOut = useMemo(() => {
    if (!selectedImage || selectedImage === "error") return false;
    try {
      return hasTransparentBackground(selectedImage);
    } catch {
      // Tainted canvas. Say nothing here: the same failure comes back with a
      // real message if the user actually asks to remove the background.
      return false;
    }
  }, [selectedImage]);

  const naturalWidth = workingImage?.naturalWidth ?? 0;
  const naturalHeight = workingImage?.naturalHeight ?? 0;

  // Fit to the box on BOTH axes, and never upscale: a small garment image blown
  // up would look sharp on the stage and blurry on the export, which is a lie.
  // The smaller of the two ratios is what makes the whole garment visible —
  // taking only the width is what used to crop it against a fixed page height.
  const scale =
    naturalWidth > 0 && available.width > 0 && available.height > 0
      ? Math.min(
          available.width / naturalWidth,
          available.height / naturalHeight,
          1
        )
      : 0;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      // contentRect excludes the box's own padding, so the stage is fitted to
      // the room it actually has rather than to the room plus its margins.
      setAvailable({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
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
    // Also detached while cutting: the handles invite a gesture that has
    // nothing to do with the decision on screen, which is the tolerance.
    transformer.nodes(node && !isExporting && !isCutting ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, isExporting, isCutting, layers]);

  // The preview itself. Runs off the loaded image every time the tolerance
  // moves, and never touches the stored layer: dropping the cut is forgetting
  // this canvas.
  useEffect(() => {
    if (!cutLayerId) return;

    const layer = layers.find((item) => item.id === cutLayerId);
    const image = layer ? layerImages[layer.url] : undefined;
    if (!image || image === "error") return;

    const timer = setTimeout(() => {
      try {
        setCutPreview({
          layerId: cutLayerId,
          removal: removeBackground(image, tolerance),
        });
      } catch {
        setCutLayerId(null);
        setCutPreview(null);
        setError(
          "No se pudo leer el logotipo para quitarle el fondo. Recarga la página e inténtalo de nuevo."
        );
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [cutLayerId, tolerance, layers, layerImages]);

  /** The preview only counts while it matches the layer being cut. */
  const preview =
    cutPreview && cutPreview.layerId === cutLayerId ? cutPreview.removal : null;

  // The recolour, live under the picker.
  //
  // Debounced for the same reason the cut is: dragging a slider fires dozens of
  // times a second and each pass walks every pixel. 80ms is short enough to
  // still read as "while you choose" and long enough to skip the intermediate
  // values nobody sees.
  //
  // Runs only in mask mode and only with something painted, so leaving the mode
  // costs nothing — and it never touches the stored image: dropping the colour
  // is forgetting this canvas.
  useEffect(() => {
    if (mode !== "mask" || !workingImage || isMaskEmpty(strokes)) return;

    const target = parseHex(color);
    if (!target) return;

    const timer = setTimeout(() => {
      try {
        const mask = rasterizeMask({
          strokes,
          width: workingImage.naturalWidth,
          height: workingImage.naturalHeight,
          mode: "mask",
        });
        setRecolorPreview({
          strokes,
          color,
          canvas: recolorRegion({ image: workingImage, mask, target }),
        });
      } catch {
        // getImageData throws on a tainted canvas, exactly like toBlob does.
        // The images arrive through useCrossOriginImage so this should not
        // happen — but it is the failure that only shows up at the end
        // (APRENDIZAJES §5.9b), so it is caught rather than assumed away.
        setError(
          "No se pudo leer la imagen para cambiarle el color. Recarga la página e inténtalo de nuevo."
        );
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [mode, workingImage, strokes, color]);

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

  /**
   * Uploading a logo without leaving the canvas (FASE_1_5 §6.4.4). Without it,
   * a client with an empty catalog strands the user on the working screen, the
   * same dead end A3 removed for base garments.
   *
   * No confirm button, for the reason in §6.4.1: choosing the file *is* the
   * decision, and a button that only ratifies it is the one that gets
   * forgotten. The name comes from the file; renaming lives in Recursos.
   */
  async function handleLogoFile(file: File | null) {
    if (!file) return;

    setError(null);
    setIsUploadingLogo(true);

    const result = await uploadClientAsset({
      clientId,
      assetType: "logo",
      file,
      baseName: stripExtension(file.name),
    });

    setIsUploadingLogo(false);
    // Let the same file be picked again after a failure.
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setOwnLogos((current) => [...current, result.data]);
    notify({ type: "success", message: "Logotipo subido." });
    router.refresh();
  }

  function handleStartCut(layerId: string) {
    setError(null);
    setSelectedId(layerId);
    setTolerance(DEFAULT_TOLERANCE);
    setCutPreview(null);
    setCutLayerId(layerId);
  }

  function handleCancelCut() {
    setCutLayerId(null);
    setCutPreview(null);
  }

  /**
   * Turns the preview into a real image: a **new** logo in the client's
   * catalog, with the original recorded as its parent, and the layer re-pointed
   * at it.
   *
   * Nothing is overwritten. The original may be placed on other designs, and
   * those keep the logo the client already saw — same reasoning as §7.8, where
   * copying layers into a new version is a snapshot and not a link.
   */
  async function handleApplyCut() {
    const layer = layers.find((item) => item.id === cutLayerId);
    if (!layer || !preview) return;

    setError(null);
    setIsApplyingCut(true);

    const blob = await toPngBlob(preview.canvas);
    if (!blob) {
      setIsApplyingCut(false);
      setError("No se pudo generar el logotipo sin fondo.");
      return;
    }

    const uploaded = await uploadDerivedClientAsset({
      clientId,
      assetType: "logo",
      blob,
      baseName: `${stripExtension(layer.name)} sin fondo`,
      parentAssetId: layer.asset_id,
    });

    if (!uploaded.ok) {
      setIsApplyingCut(false);
      setError(uploaded.error);
      return;
    }

    const logo = uploaded.data;

    // The placement does not move: the layer keeps its id, its geometry and
    // its z-index, and only the image behind it changes.
    const result = await apiPatch<DesignLayer>(
      `/api/designs/${designId}/layers/${layer.id}`,
      { asset_id: logo.id }
    );

    setIsApplyingCut(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setLayers((current) =>
      current.map((item) =>
        item.id === layer.id
          ? {
              ...item,
              asset_id: logo.id,
              url: logo.url,
              name: assetDisplayName(logo),
            }
          : item
      )
    );
    setOwnLogos((current) => [...current, logo]);
    setCutLayerId(null);
    setCutPreview(null);

    notify({ type: "success", message: "Fondo quitado." });
    router.refresh();
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
  // While a cut is on screen the canvas is showing a proposal, not the design:
  // moving layers around underneath it would be editing two things at once.
  const canManipulate = canCompose && !isCutting;

  /** The recolour only counts while it matches the strokes and colour on screen. */
  const activeRecolor =
    recolorPreview &&
    recolorPreview.strokes === strokes &&
    recolorPreview.color === color
      ? recolorPreview.canvas
      : null;

  const isMasking = mode === "mask";
  // Layers stop responding while painting: a drag meant for the brush must not
  // pick up a logo underneath it.
  const canMoveLayers = canManipulate && !isMasking;
  const canPaint = canCompose && isMasking;

  /**
   * Where the pointer is, as a ratio of the working image.
   *
   * Konva reports stage coordinates, which are already divided by the zoom, so
   * dividing by the natural size is all that is left. Ratios are what the mask
   * stores, for the same reason `design_layers` stores them: the image changes
   * size along the pipeline and pixels would not survive it.
   */
  function pointerRatio(): { x: number; y: number } | null {
    const stage = stageRef.current;
    const point = stage?.getRelativePointerPosition();
    if (!point || naturalWidth === 0 || naturalHeight === 0) return null;
    return { x: point.x / naturalWidth, y: point.y / naturalHeight };
  }

  function startStroke() {
    if (!canPaint) return;
    const point = pointerRatio();
    if (!point) return;

    isPainting.current = true;
    setStrokes((current) => [
      ...current,
      { points: [point], width: brush, erase: tool === "eraser" },
    ]);
  }

  function extendStroke() {
    if (!isPainting.current) return;
    const point = pointerRatio();
    if (!point) return;

    // Appends to the last stroke rather than pushing a new one: a stroke is the
    // whole drag, and that is what the eraser's compositing operates on.
    setStrokes((current) => {
      if (current.length === 0) return current;
      const last = current[current.length - 1];
      return [
        ...current.slice(0, -1),
        { ...last, points: [...last.points, point] },
      ];
    });
  }

  function endStroke() {
    isPainting.current = false;
  }

  function clearMask() {
    // The preview needs no clearing: it is tagged with the strokes array that
    // produced it, and this one is a different array.
    setStrokes([]);
  }

  /**
   * Keeps the recoloured garment as a new step of the design.
   *
   * `origin = 'derived'` and not `'generated'`: this came out of a reproducible
   * transformation, not out of a model that charged for it. That is exactly the
   * line migration 012 drew, and it is what keeps the running cost of a design
   * honest — a recolour must never show up as money spent.
   *
   * `asset_type` is still `'inpainting'` because that is what it is: zone
   * editing of Módulo 2. The type says what the image is, the origin says how it
   * was obtained.
   */
  async function handleApplyColor() {
    if (!activeRecolor || !workingAssetId) return;

    setIsApplyingColor(true);
    setError(null);

    const blob = await toPngBlob(activeRecolor);
    if (!blob) {
      setIsApplyingColor(false);
      setError("No se pudo guardar el color. Recarga la página e inténtalo de nuevo.");
      return;
    }

    const uploaded = await uploadDesignAsset({
      designId,
      assetType: "inpainting",
      blob,
      // Same shape as the composition export two hundred lines up: the design
      // names the file, and what follows says which step it is. A file called
      // "color-2f3e8c.png" sitting in a downloads folder says nothing about
      // which garment it belongs to, and the strip will list several of these.
      // The '#' is dropped: it is legal in a filename and awkward in every
      // URL that later carries it.
      baseName: `${designName} color ${color.replace("#", "").toUpperCase()}`,
      parentAssetId: workingAssetId,
      origin: "derived",
    });

    if (!uploaded.ok) {
      setIsApplyingColor(false);
      setError(uploaded.error);
      return;
    }

    // The cursor follows: what was just applied is what the design is working
    // on now. Going back to an earlier step stays a separate, explicit act.
    const pointed = await apiPatch(`/api/designs/${designId}`, {
      current_asset_id: uploaded.data.id,
    });

    setIsApplyingColor(false);

    if (!pointed.ok) {
      setError(pointed.error);
      return;
    }

    setStrokes([]);
    notify({ type: "success", message: "Color aplicado." });
    router.refresh();
  }

  return (
    <div className={styles.workspace}>
      {isMasking && (
        <MaskTools
          tool={tool}
          onToolChange={setTool}
          brush={brush}
          onBrushChange={setBrush}
          onClear={clearMask}
          isEmpty={isMaskEmpty(strokes)}
          disabled={!canPaint}
        />
      )}

      <div className={styles.canvasColumn}>
        <div className={styles.stageBox} ref={containerRef}>
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
              style={canPaint ? { cursor: "crosshair" } : undefined}
              onMouseDown={(event) => {
                if (canPaint) {
                  startStroke();
                  return;
                }
                // Clicking the garment itself clears the selection.
                if (event.target === event.target.getStage()) setSelectedId(null);
              }}
              onMouseMove={extendStroke}
              onMouseUp={endStroke}
              // A drag that leaves the canvas has ended as far as the mask is
              // concerned; without this the next re-entry continues the old
              // stroke and draws a line across the garment.
              onMouseLeave={endStroke}
              onTouchStart={startStroke}
              onTouchMove={extendStroke}
              onTouchEnd={endStroke}
            >
              <Layer listening={false}>
                {/* The proposal replaces the garment while it is on screen, so
                    the logo above it is judged against the colour that would
                    actually ship — not against the one being replaced. */}
                <KonvaImage
                  image={activeRecolor ?? workingImage ?? undefined}
                  width={naturalWidth}
                  height={naturalHeight}
                />
              </Layer>
              <Layer>
                {layers.map((layer) => (
                  <LayerNode
                    key={layer.id}
                    layer={layer}
                    image={
                      cutLayerId === layer.id && preview
                        ? preview.canvas
                        : layerImages[layer.url]
                    }
                    naturalWidth={naturalWidth}
                    naturalHeight={naturalHeight}
                    draggable={canMoveLayers}
                    onSelect={() => canMoveLayers && setSelectedId(layer.id)}
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
                  // Hidden while painting: the handles belong to a logo nobody
                  // is moving right now, and they sit on top of the brush.
                  visible={!isMasking}
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

              {/* One signal at a time. While the brush is moving there is no
                  recolour yet (it is debounced), so the accent overlay shows
                  WHERE the paint is landing. The moment the recolour appears it
                  shows WHAT it will look like, in the real colour, over exactly
                  the same region — so the overlay steps aside instead of
                  tinting it. Two translucent layers of different colours over
                  the same pixels was reading as a third colour. */}
              {isMasking && !activeRecolor && (
                <MaskLayer
                  strokes={strokes}
                  naturalWidth={naturalWidth}
                  naturalHeight={naturalHeight}
                  color={designToken("--color-accent")}
                />
              )}
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

        {/* The two modules, as a mode switch and not as two screens. They are
            toggle buttons and not tabs on purpose: nothing is being swapped
            underneath — the canvas, the garment and the logo preview stay put,
            only the tools change (STYLE_GUIDE §7.2). */}
        {canEdit && (
          <div className={styles.group}>
            <PillTabs
              label="Qué estoy editando"
              selected={mode}
              onSelect={(key) => {
                setMode(key as WorkspaceMode);
                // Leaving mask mode drops the selection so the transformer does
                // not come back around a logo the user stopped thinking about.
                if (key === "mask") setSelectedId(null);
              }}
              options={[
                { key: "logos", label: "Componer logos" },
                { key: "mask", label: "Editar prenda" },
              ]}
            />
          </div>
        )}

        {/* Only the active mode's panel. Showing both was the prototype's
            layout and was discarded (FASE_1_5 §7.5): two tasks competing for
            attention leave the canvas squashed between them. */}
        {/* Rendered from the moment the mode opens, not when the first stroke
            lands. Appearing on the first drag resized the panel — and therefore
            the canvas — in the middle of the gesture that created it, which
            moved the garment out from under the brush. */}
        {isMasking && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Color de la prenda</span>
            <ColorPanel
              color={color}
              onColorChange={setColor}
              onApply={handleApplyColor}
              onDiscard={clearMask}
              hasMask={!isMaskEmpty(strokes)}
              isApplying={isApplyingColor}
              disabled={!canPaint}
            />
          </div>
        )}

        <div className={styles.group}>
          <span className={styles.groupLabel}>Logotipos</span>
          {availableLogos.length === 0 ? (
            <p className={styles.hint}>
              Este cliente no tiene logotipos todavía. Sube uno para colocarlo
              sobre la prenda.
            </p>
          ) : (
            <div className={styles.logoRow}>
              {availableLogos.map((logo) => (
                <button
                  key={logo.id}
                  type="button"
                  className={styles.logoButton}
                  onClick={() => handleAddLogo(logo)}
                  disabled={!canManipulate || isBusy}
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

          {/* Hidden because the Button is the control: a bare file input cannot
              be styled to match, and two visible triggers for one action is
              exactly the ambiguity the guide forbids. */}
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            accept={uploadAcceptFor("logo")}
            onChange={(event) =>
              handleLogoFile(event.target.files?.[0] ?? null)
            }
            tabIndex={-1}
            aria-hidden="true"
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canEdit || isUploadingLogo || isCutting}
            title={
              canEdit ? undefined : "No tienes permisos para editar este cliente."
            }
          >
            {isUploadingLogo ? "Subiendo…" : "+ Subir logotipo"}
          </Button>
          <p className={styles.hint}>
            PNG, JPEG, WEBP o SVG. Un SVG se convierte a PNG al subirlo.
          </p>
        </div>

        {selectedLayer && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Fondo del logotipo</span>

            {!selectedImage || selectedImage === "error" ? (
              <p className={styles.hint}>
                La imagen de esta capa no se pudo cargar, así que no se le puede
                quitar el fondo.
              </p>
            ) : cutLayerId === selectedLayer.id ? (
              <>
                <label className={styles.sliderLabel} htmlFor="cut-tolerance">
                  Tolerancia
                  <span className={styles.sliderValue}>
                    {Math.round(tolerance * 100)}
                  </span>
                </label>
                <input
                  id="cut-tolerance"
                  className={styles.slider}
                  type="range"
                  min={0}
                  max={Math.round(MAX_TOLERANCE * 100)}
                  step={1}
                  value={Math.round(tolerance * 100)}
                  onChange={(event) =>
                    setTolerance(Number(event.target.value) / 100)
                  }
                  disabled={isApplyingCut}
                />
                <p className={styles.hint}>
                  {preview
                    ? `Se quitó el ${Math.round(
                        preview.removedShare * 100
                      )}% de la imagen. Sube la tolerancia si queda fondo, bájala si se come el logotipo.`
                    : "Calculando…"}
                </p>
                {preview && preview.removedShare > OVERCUT_SHARE && (
                  <p className={styles.warning}>
                    Con esta tolerancia se está borrando casi todo el logotipo.
                  </p>
                )}
                <div className={styles.cutActions}>
                  <Button
                    variant="secondary"
                    onClick={handleCancelCut}
                    disabled={isApplyingCut}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleApplyCut}
                    disabled={!preview || isApplyingCut}
                  >
                    {isApplyingCut ? "Quitando…" : "Quitar fondo"}
                  </Button>
                </div>
              </>
            ) : selectedIsCutOut ? (
              <p className={styles.hint}>
                Este logotipo ya tiene el fondo transparente. No hace falta
                recortarlo.
              </p>
            ) : (
              <>
                <p className={styles.hint}>
                  El logotipo tiene fondo. Puedes recortarlo sin salir de acá; se
                  guarda como un logotipo nuevo y el original no se toca.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => handleStartCut(selectedLayer.id)}
                  disabled={!canCompose}
                  title={
                    canEdit
                      ? undefined
                      : "No tienes permisos para editar este cliente."
                  }
                >
                  Quitar fondo
                </Button>
              </>
            )}
          </div>
        )}

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
                      disabled={isCutting && cutLayerId !== layer.id}
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
                      disabled={!canEdit || isCutting}
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
          {/* Steps aside while a cut is on screen, so the panel keeps exactly
              one primary: there, the decision is the tolerance. Same rule as
              the base garment picker in FASE_1_5 §2, A4. */}
          <Button
            variant={isCutting ? "secondary" : "primary"}
            onClick={handleExport}
            disabled={!canManipulate || layers.length === 0 || isExporting}
          >
            {isExporting ? "Creando…" : "Crear composición"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Intrinsic size of whatever a layer is drawing.
 *
 * A cut-out preview is a `<canvas>`, and a canvas has `width`/`height` while an
 * image has `naturalWidth`/`naturalHeight`. Reading the wrong pair yields
 * `undefined`, the height comes out `NaN`, and the layer silently disappears
 * the moment the preview turns on.
 */
function intrinsicSize(image: HTMLImageElement | HTMLCanvasElement): {
  width: number;
  height: number;
} {
  return image instanceof HTMLCanvasElement
    ? { width: image.width, height: image.height }
    : { width: image.naturalWidth, height: image.naturalHeight };
}

interface LayerNodeProps {
  layer: WorkspaceLayer;
  /** Already loaded by the parent, outside the Konva tree. */
  image: LayerImage;
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

  const intrinsic = intrinsicSize(image);
  const height =
    intrinsic.width > 0 ? width * (intrinsic.height / intrinsic.width) : width;

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
