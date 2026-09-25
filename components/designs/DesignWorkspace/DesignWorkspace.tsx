"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import { Button } from "@/components/ui/Button/Button";
import { MaskTools, type MaskTool } from "@/components/designs/MaskTools/MaskTools";
import { ColorPanel } from "@/components/designs/ColorPanel/ColorPanel";
import { StepStrip, type WorkStep } from "@/components/designs/StepStrip/StepStrip";
import { LogoPicker } from "@/components/designs/LogoPicker/LogoPicker";
import { LogoBackground } from "@/components/designs/LogoBackground/LogoBackground";
import { LayerList } from "@/components/designs/LayerList/LayerList";
import { GenerationPanel } from "@/components/designs/GenerationPanel/GenerationPanel";
import { InstructionPanel } from "@/components/designs/InstructionPanel/InstructionPanel";
import { WorkingOverlay } from "@/components/ui/WorkingOverlay/WorkingOverlay";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete, apiPatch, apiPost } from "@/lib/api-client";
import {
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
  hasTransparentBackground,
  removeBackground,
  toPngBlob,
  type BackgroundRemoval,
} from "@/lib/background-removal";
import {
  DEFAULT_BRUSH,
  EMPTY_MASK,
  isMaskEmpty,
  maskToPngBlob,
  rasterizeMask,
  type Mask,
} from "@/lib/mask";
import { isUsefulSelection, selectGarment } from "@/lib/garment-select";
import type { InpaintIntent } from "@/lib/generation/types";
import { fillRegion, parseHex, recolorRegion, samplePixel } from "@/lib/recolor";
import type { DesignLayer } from "@/lib/types";
import {
  useCrossOriginImage,
  useCrossOriginImages,
  type LoadedImage,
} from "./useCrossOriginImage";
import { MaskLayer } from "./MaskLayer";
import { BrushCursor } from "./BrushCursor";
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
  /** Where the working image has been, oldest first. */
  steps: WorkStep[];
  currentAssetId: string | null;
  /**
   * What the design STARTED from, which decides whether the automatic garment
   * selection is offered at all. A design begun on a model photo keeps a person
   * in every image derived from it, and that method cannot separate a shirt
   * from the body wearing it.
   */
  baseAssetType: string | null;
  /** True while the generation provider is the simulator. */
  isSimulated: boolean;
  canEdit: boolean;
}

/** What a layer draws: the logo as it arrived, or a live cut-out preview. */
type LayerImage = LoadedImage | HTMLCanvasElement;

/**
 * What the user is doing to the design right now.
 *
 * Four, and they are four because they are four different acts, not because a
 * menu grew. The split that matters is between the middle two: **painting
 * changes pixels and produces a new image; masking declares a region and
 * produces a mask.** The same brush served both until now, which meant the same
 * gesture meant two things depending on a mode nobody was looking at.
 *
 * The automatic selection lives in `paint` and not in `zones` on purpose. It
 * returns the *silhouette of the garment*, which is exactly the question
 * recolouring asks and almost never the one inpainting asks: a useful mask
 * marks a collar, an emblem, a sleeve. The whole outline is the answer to a
 * different question.
 *
 * `zones` and `instruction` are named after what they store
 * (`ASSET_TYPE_COPY`), so the mode and the asset it produces share a word.
 */
type WorkspaceMode = "logos" | "paint" | "zones" | "instruction";

/** Fraction of the garment width a freshly placed logo takes. */
const DEFAULT_WIDTH_RATIO = 0.25;

/**
 * A range input fires on every step of a drag, and each recompute walks the
 * whole bitmap. One frame of grace collapses the burst into a single pass.
 */
const PREVIEW_DEBOUNCE_MS = 80;

/**
 * How many mask gestures can be stepped back.
 *
 * Deep enough to cover a run of bad strokes, shallow enough that the whole
 * history stays a handful of small objects — a mask is a list of gestures, not
 * a bitmap, so each entry costs almost nothing. The one exception is an
 * automatic selection, which carries a full-frame canvas; the cap is what keeps
 * a session of pressing the wand from holding twenty of them alive.
 */
const UNDO_LIMIT = 12;

/**
 * Bajo esto, el fondo y la prenda están tan cerca en color que el relleno no
 * tenía con qué separarlos — el caso de la camisa blanca sobre fondo blanco.
 * Sirve solo para elegir qué decirle al usuario; quién decide si la selección
 * vale es `isUsefulSelection`, que es donde vive la regla.
 */
const CONTRASTE_MINIMO = 53;

/** Compartido y estable: una pila vacía nueva por render sería otra identidad. */
const EMPTY_UNDO: Mask[] = [];

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
  steps,
  currentAssetId,
  baseAssetType,
  isSimulated,
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
  /**
   * Abre en el primer paso del flujo, no en el último.
   *
   * Arrancaba en `logos` de cuando ese modo encabezaba la lista. Al
   * moverlo al final —porque componer va después de lo generativo— el
   * valor inicial quedó señalando la cuarta opción, así que la pantalla
   * abría en el paso que el orden acababa de declarar último.
   */
  const [mode, setMode] = useState<WorkspaceMode>("zones");

  // The mask: the garment picked in one gesture plus the brush and eraser
  // passes over it, kept as gestures rather than as pixels so it survives the
  // working image changing size along the pipeline (see lib/mask.ts).
  //
  // **Tagged with the image it was painted on**, and derived from that tag
  // rather than cleared by whoever changes the image. The previous version
  // cleared it at the three places that changed the working image from inside
  // this component, and that was reasoning about a list of callers instead of
  // about the invariant — so it missed the fourth: `BaseGarmentPicker`, which
  // lives in the page above and swaps the garment underneath. A region painted
  // over one garment means nothing over another, and the automatic selection is
  // a bitmap the size of the garment it was worked out from.
  const [paintedOn, setPaintedOn] = useState<string | null>(workingImageUrl);
  const [rawMask, setRawMask] = useState<Mask>(EMPTY_MASK);
  const [rawUndo, setRawUndo] = useState<Mask[]>(EMPTY_UNDO);

  const maskBelongsHere = paintedOn === workingImageUrl;
  const mask = maskBelongsHere ? rawMask : EMPTY_MASK;
  const undoStack = maskBelongsHere ? rawUndo : EMPTY_UNDO;

  // Both setters re-stamp the tag, so any gesture adopts the image on screen.
  // They resolve the base value themselves: an updater must never be handed a
  // mask that belonged to a picture that is no longer there.
  // `useCallback` no es adorno: `handleUndo` los usa y a su vez lo usa el
  // efecto del atajo de teclado, así que sin esto el efecto se volvería a
  // registrar en cada render.
  const setMask = useCallback(
    (next: Mask | ((current: Mask) => Mask)) => {
      setPaintedOn(workingImageUrl);
      setRawMask((current) => {
        const base = maskBelongsHere ? current : EMPTY_MASK;
        return typeof next === "function" ? next(base) : next;
      });
    },
    [workingImageUrl, maskBelongsHere]
  );

  const setUndoStack = useCallback(
    (next: Mask[] | ((current: Mask[]) => Mask[])) => {
      setPaintedOn(workingImageUrl);
      setRawUndo((current) => {
        const base = maskBelongsHere ? current : EMPTY_UNDO;
        return typeof next === "function" ? next(base) : next;
      });
    },
    [workingImageUrl, maskBelongsHere]
  );
  const [tool, setTool] = useState<MaskTool>("brush");
  const [instruction, setInstruction] = useState("");
  const modeLabelId = useId();
  // The ref answers "is a drag in progress" synchronously, inside the pointer
  // handlers; the state is what the canvas renders from. Both, because a ref
  // does not re-render and the canvas has to change while the pointer is down.
  const [isDrawing, setIsDrawing] = useState(false);
  const [brush, setBrush] = useState<number>(DEFAULT_BRUSH);
  const strokeInFlight = useRef(false);

  // The colour starts on the accent rather than on a literal: any hex written
  // here would be a second palette living outside globals.css (§5.1). It is
  // only a starting point — the first thing the user does is move it.
  const [color, setColor] = useState<string>(() =>
    designToken("--color-accent")
  );
  // The recoloured garment, live on the canvas until it is applied or dropped.
  // Same shape as the background-removal preview: a proposal, not the design.
  //
  // Tagged with what produced it — the exact mask object and the exact colour —
  // and matched at render. That is the third time this project needs the
  // pattern (APRENDIZAJES §5.14): an effect that clears state synchronously is
  // both a lint error and a race, because a result arriving after the user
  // moved on would otherwise have to be cancelled from inside the effect that
  // produced it. Here it is simply not the current one.
  const [recolorPreview, setRecolorPreview] = useState<{
    mask: Mask;
    color: string;
    /** Which brush produced it. A preview made by the other one is stale. */
    style: "fabric" | "flat";
    canvas: HTMLCanvasElement;
  } | null>(null);
  const [isApplyingColor, setIsApplyingColor] = useState(false);

  // Which step is being LOOKED at, which is not where the design is standing.
  // Keeping them apart is what lets a click preview without changing anything
  // (FASE_1_5 §7.4).
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(false);

  // The generative half. Colour is offered here too, but as the measured arm of
  // the §2.3 comparison rather than as the way to change a colour — the panel
  // itself says which one is exact.
  // Opens on the one with evidence behind it rather than on the first tab:
  // removing an element is the job this model was measured to do well.
  const [intent, setIntent] = useState<InpaintIntent>("clean");
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Image>());

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

  // Which layers could not be loaded, as ids, because that is what the list
  // asks about. Derived here and not in the list itself: the images are loaded
  // by this component and the list has no business knowing about URLs.
  const brokenLayerIds = useMemo(
    () =>
      new Set(
        layers
          .filter((layer) => layerImages[layer.url] === "error")
          .map((layer) => layer.id)
      ),
    [layers, layerImages]
  );

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
    if (mode !== "paint" || !workingImage || isMaskEmpty(mask)) return;

    const target = parseHex(color);
    if (!target) return;

    const timer = setTimeout(() => {
      try {
        const rasterized = rasterizeMask({
          mask,
          width: workingImage.naturalWidth,
          height: workingImage.naturalHeight,
          mode: "mask",
        });
        // Which brush is selected decides what the painted region becomes, and
        // the preview has to answer the same way the apply will: fabric keeps
        // the shading, flat throws it away. Seeing the difference immediately
        // is the only way the two brushes explain themselves.
        const render = tool === "flat" ? fillRegion : recolorRegion;
        setRecolorPreview({
          mask,
          color,
          style: tool === "flat" ? "flat" : "fabric",
          canvas: render({
            image: workingImage,
            mask: rasterized,
            target,
          }),
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
  }, [mode, workingImage, mask, color, tool]);

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

  /**
   * Moves the cursor back to an earlier step.
   *
   * One column update and nothing else: the image is already in R2 and already
   * has its row, so going back never generates and never charges. That is the
   * whole economic argument for keeping the history on the server, and it is
   * what H-15 asks for — "prefiero el azul de hace dos cambios".
   *
   * The route verifies the asset actually belongs to this design before
   * pointing at it: `current_asset_id` is a foreign key writable from the API,
   * and those are checked below RLS.
   */
  async function handleResume(assetId: string) {
    setIsResuming(true);
    setError(null);

    const result = await apiPatch(`/api/designs/${designId}`, {
      current_asset_id: assetId,
    });

    setIsResuming(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // The mask belonged to the image being left behind: a region painted over
    // one garment means nothing over another, and the automatic selection is a
    // bitmap the size of the garment it was worked out from.
    resetMask();
    setSelectedStepId(null);
    notify({ type: "success", message: "Volviste a ese paso." });
    router.refresh();
  }

  /**
   * Sends the masked region off to be regenerated.
   *
   * Three steps, in this order and for a reason:
   *
   *   1. The mask is rasterised **at the size inference will use**, snapped to
   *      the 64px grid by the same function the server uses to build the
   *      request. Two answers to "how big is this" is how a mask ends up
   *      describing a region the model never sees.
   *   2. It is stored as a real asset of the design (`asset_type = 'mask'`), so
   *      the provider can fetch it by URL and so the record of what was asked
   *      survives the session.
   *   3. Only then the generation. The route re-checks that both images belong
   *      to this design before reading them — foreign keys are verified below
   *      RLS, and the browser is not a place to enforce that.
   *
   * The result is the design's new working image, and the route moves the
   * cursor onto it. A failure writes nothing and charges nothing: the design is
   * left exactly as it was, which is what makes pressing again safe.
   */
  /**
   * Editing by instruction: one request, and no mask anywhere.
   *
   * **Shorter than `handleGenerate` by exactly the part that goes wrong.** That
   * one has to rasterize a mask, upload it as an asset, and clean it up when the
   * route says no, because the upload happens before the call. Here there is
   * nothing to upload, so a rejection leaves nothing behind.
   *
   * The canvas is the server's business again: this model takes only the sizes
   * on its own list, and the route snaps to them from the dimensions it has on
   * record (`snapToKontextSize`). The browser does not need to know the list.
   */
  async function handleInstructionGenerate() {
    if (!workingAssetId || instruction.trim().length < 10) return;

    setIsGenerating(true);
    setError(null);

    const result = await apiPost("/api/generate/edit", {
      design_id: designId,
      image_asset_id: workingAssetId,
      instruction,
    });

    setIsGenerating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setInstruction("");
    notify({ type: "success", message: "Listo, se generó un paso nuevo." });
    router.refresh();
  }

  async function handleGenerate() {
    if (!workingImage || !workingAssetId || isMaskEmpty(mask)) return;

    setIsGenerating(true);
    setError(null);

    // **La máscara se rasteriza al tamaño REAL de la imagen, no al encajado.**
    //
    // Antes iba al tamaño que se le pide al modelo (múltiplos de 64) mientras
    // la imagen iba a su tamaño natural, así que las dos llegaban midiendo
    // distinto y la alineación dependía de qué hiciera el proveedor con esa
    // diferencia. Ahora coinciden por construcción: lo que el proveedor haga
    // para meterlas en su lienzo se lo hace a las dos por igual.
    //
    // Quién decide el lienzo sigue siendo el servidor, con `snapToInferenceSize`
    // sobre las dimensiones que tiene registradas. Acá no hace falta saberlo.
    const maskBlob = await maskToPngBlob(
      rasterizeMask({
        mask,
        width: workingImage.naturalWidth,
        height: workingImage.naturalHeight,
        mode: "mask",
      })
    );

    if (!maskBlob) {
      setIsGenerating(false);
      setError("No se pudo preparar la máscara. Inténtalo de nuevo.");
      return;
    }

    const stored = await uploadDesignAsset({
      designId,
      assetType: "mask",
      blob: maskBlob,
      baseName: `${designName} mascara`,
      parentAssetId: workingAssetId,
      origin: "derived",
    });

    if (!stored.ok) {
      setIsGenerating(false);
      setError(stored.error);
      return;
    }

    const result = await apiPost("/api/generate/inpainting", {
      design_id: designId,
      image_asset_id: workingAssetId,
      mask_asset_id: stored.data.id,
      intent,
      prompt: description,
    });

    setIsGenerating(false);

    if (!result.ok) {
      // **La máscara se sube antes de llamar, así que un rechazo la deja
      // huérfana.** Se limpia acá porque acá es donde se creó: una sesión de
      // pruebas dejó tres máscaras sin dueño en la base sin que nadie lo
      // notara.
      //
      // Esto trata el síntoma. El arreglo de fondo es invertir el orden —
      // validar antes de subir, o subir dentro de la misma petición — y queda
      // anotado en `FASE_2_INPAINTING` §4k. Mientras tanto, lo que no se puede
      // evitar es que el navegador se cierre a mitad; lo que sí, es dejar
      // basura cada vez que el servidor dice que no.
      void apiDelete(`/api/assets/${stored.data.id}`);
      setError(result.error);
      return;
    }

    resetMask();
    setDescription("");
    notify({ type: "success", message: "Listo, se generó un paso nuevo." });
    router.refresh();
  }

  async function handleExport() {
    const stage = stageRef.current;
    if (!stage || !workingImage) return;

    setError(null);
    setSelectedId(null);
    setIsExporting(true);

    // Let the deselection and the mask overlay clear before grabbing pixels.
    //
    // `stage.toBlob()` captures EVERY layer, which is why the transformer had
    // to be hidden first — and the mask overlay is the same class of thing: a
    // control drawn on the canvas, not part of the design. A composition
    // exported with a mask still painted came out with the accent ink baked
    // into it, which is the one thing that must never reach the client.
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
    // Una composición es un render, no un paso: deliberadamente NO se vuelve la
    // imagen de trabajo (§7.7). El refresco es para que el hub la recoja.
    //
    // No se muestra acá una vista previa ni un botón hacia la presentación: el
    // enlace a presentación vive arriba y está siempre disponible, así que un
    // segundo camino al mismo lugar solo competiría con él.
    router.refresh();
  }

  const stageWidth = naturalWidth * scale;
  const stageHeight = naturalHeight * scale;
  const canCompose = canEdit && workingStatus === "loaded";
  // While a cut is on screen the canvas is showing a proposal, not the design:
  // moving layers around underneath it would be editing two things at once.
  const canManipulate = canCompose && !isCutting;

  /** The recolour only counts while it matches the mask and colour on screen. */
  const paintStyle = tool === "flat" ? "flat" : "fabric";
  const activeRecolor =
    recolorPreview &&
    recolorPreview.mask === mask &&
    recolorPreview.color === color &&
    // Also the brush: switching between fabric and flat changes what the same
    // region becomes, so a preview made by the other one is as stale as one
    // made for another colour.
    recolorPreview.style === paintStyle
      ? recolorPreview.canvas
      : null;

  /**
   * What the garment layer actually shows.
   *
   * The middle term is the fix for a flash. Every stroke invalidates the
   * recolour, and for the 80ms of the debounce plus however long the pass takes
   * the canvas used to fall back to the raw garment — so painting on a shirt
   * that had just turned navy made it blink back to white on every stroke.
   *
   * While the pointer is down, the previous recolour stays up. It is slightly
   * behind the mask, which is fine: it is a preview, and a preview that lags by
   * one stroke reads as continuous where a colour that flickers reads as
   * broken. It is only used **while drawing**, so clearing the mask still
   * returns the garment immediately, and only when the colour still matches —
   * showing the old hue after the picker moved would be showing the wrong
   * answer rather than an old one.
   */
  const stageImage =
    activeRecolor ??
    (isDrawing && recolorPreview && recolorPreview.color === color
      ? recolorPreview.canvas
      : null) ??
    workingImage ??
    undefined;

  const isComposing = mode === "logos";
  const isPainting = mode === "paint";
  const isZones = mode === "zones";
  const isInstructing = mode === "instruction";

  /**
   * The two modes that hand the user a brush.
   *
   * They share the buffer and the rail, and differ in what the painted region
   * *means* — which is why switching between them clears it (see `changeMode`).
   */
  const hasBrush = isPainting || isZones;

  // Layers stop responding while painting: a drag meant for the brush must not
  // pick up a logo underneath it.
  const canMoveLayers = canManipulate && isComposing;
  const canPaint = canCompose && hasBrush;

  /**
   * The automatic selection separates an object from a **flat background**, and
   * on a photograph of someone wearing the garment the object is the person.
   *
   * Two different failures, and only one of them announces itself. A busy
   * background makes the fill leak outside the shirt, and the contrast guard
   * added on 17-sep catches that. A *white* background behind a person does not
   * trip any guard: there is plenty of contrast and the coverage lands in the
   * plausible range, so it quietly returns a person-shaped selection.
   *
   * There is no honest way to tell those apart from inside the method, so the
   * tool is withdrawn where it cannot work and says why. The signal is what the
   * design STARTED from, not what it is working on now: once the canvas came
   * from a model photo, every image derived from it still has a person in it.
   */
  const garmentSelectFits = baseAssetType !== "model_photo";

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

  /**
   * Remembers the mask about to be replaced.
   *
   * Called at the START of a gesture, not at the end: by the time a drag
   * finishes, the thing worth going back to is gone. Cheap because a mask is a
   * list of gestures — the stored object is the same one that was on screen,
   * not a copy of any pixels.
   */
  function pushUndo(previous: Mask) {
    setUndoStack((stack) => [...stack.slice(-(UNDO_LIMIT - 1)), previous]);
  }

  /**
   * Steps back one gesture.
   *
   * The top of the stack is read from the render value rather than from inside
   * a `setUndoStack` updater. Putting the `setMask` in there would have been
   * shorter and would have worked, but an updater has to be pure — React calls
   * it twice in development to check exactly that — and a state setter inside
   * one is a side effect hiding in a place nobody looks for side effects.
   */
  const handleUndo = useCallback(() => {
    const previous = undoStack[undoStack.length - 1];
    if (previous === undefined) return;
    setMask(previous);
    setUndoStack((stack) => stack.slice(0, -1));
  }, [undoStack, setMask, setUndoStack]);

  /**
   * Ctrl+Z, because a painting tool that only undoes from a button is a
   * painting tool people do not undo in.
   *
   * Two guards, and both matter. It is off outside mask mode, where there is
   * nothing to undo and the shortcut would eat a keystroke for no reason. And
   * it steps aside inside a text field: the prompt box and the hex input have
   * their own undo, which belongs to the browser and is the one the user means
   * while their cursor is in there.
   */
  useEffect(() => {
    if (!canPaint) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "z" && event.key !== "Z") return;
      if (!event.ctrlKey && !event.metaKey) return;
      // Redo is a different feature; leaving Shift alone keeps the door open
      // rather than quietly doing the wrong thing with it.
      if (event.shiftKey) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable]")
      ) {
        return;
      }

      event.preventDefault();
      handleUndo();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canPaint, handleUndo]);

  /**
   * Drops the mask AND its history, for when the image underneath changes.
   *
   * Keeping the history across a new working image would offer to restore a
   * region painted over a different garment, which is the kind of undo that is
   * worse than none.
   */
  function resetMask() {
    setMask(EMPTY_MASK);
    setUndoStack([]);
  }

  function startStroke() {
    if (!canPaint) return;
    const point = pointerRatio();
    if (!point) return;

    // The eyedropper is in the rail but it is not a brush: it reads a colour
    // out of the garment and changes nothing. Handled here rather than as a
    // third stroke kind because there is no stroke — no undo entry either,
    // since nothing was altered to step back from.
    if (tool === "picker") {
      if (!workingImage) return;
      const picked = samplePixel(workingImage, point.x, point.y);
      if (picked) setColor(picked);
      return;
    }

    // The whole drag is one step back, so this is the only place a stroke is
    // recorded — extendStroke appends to a stroke that already exists.
    pushUndo(mask);
    strokeInFlight.current = true;
    setIsDrawing(true);
    setMask((current) => ({
      ...current,
      strokes: [
        ...current.strokes,
        { points: [point], width: brush, erase: tool === "eraser" },
      ],
    }));
  }

  function extendStroke() {
    if (!strokeInFlight.current) return;
    const point = pointerRatio();
    if (!point) return;

    // Appends to the last stroke rather than pushing a new one: a stroke is the
    // whole drag, and that is what the eraser's compositing operates on.
    setMask((current) => {
      if (current.strokes.length === 0) return current;
      const last = current.strokes[current.strokes.length - 1];
      return {
        ...current,
        strokes: [
          ...current.strokes.slice(0, -1),
          { ...last, points: [...last.points, point] },
        ],
      };
    });
  }

  function endStroke() {
    strokeInFlight.current = false;
    setIsDrawing(false);
  }

  function clearMask() {
    // Undoable rather than confirmed. A dialog on every clear is friction on an
    // action used deliberately and often in a painting tool; being able to step
    // back costs the user nothing and covers the accident just as well.
    pushUndo(mask);
    // The preview needs no clearing: it is tagged with the mask that produced
    // it, and this is a different one.
    setMask(EMPTY_MASK);
  }

  /**
   * Switching modes drops what was painted, on purpose.
   *
   * The buffer is shared but its MEANING is not: in `paint` a region is what
   * gets recoloured, in `zones` it is what the model may rewrite. Carrying one
   * into the other would hand the next step a region that answered a different
   * question — and it would do it silently, which is the worst version.
   *
   * It goes through `clearMask`, so it lands on the undo stack: a mis-click on
   * the mode switch costs one Ctrl+Z, not a minute of painting.
   */
  function changeMode(next: WorkspaceMode) {
    if (next === mode) return;

    // The transformer must not come back around a logo the user stopped
    // thinking about the moment they left the composing mode.
    setSelectedId(null);
    if (!isMaskEmpty(mask)) clearMask();
    setMode(next);
  }

  /**
   * Picks the whole garment at once (`lib/garment-select.ts`).
   *
   * The one control in the rail that decides where the paint goes instead of
   * following the hand, and the reason the module is usable at all: a shirt
   * takes a minute to trace with a brush and half of that minute is spent
   * keeping the colour off the background.
   *
   * It replaces the base and **keeps the strokes**, so pressing it after having
   * painted does not throw that work away — the passes simply land on top of a
   * selection instead of on nothing.
   *
   * Synchronous, like the background removal it is built on: it walks every
   * pixel once and there is nothing useful to render halfway through. And it
   * refuses to apply a selection that covers almost nothing or almost
   * everything, because both mean the fill did not find the garment, and a
   * useless mask applied in silence is worse than one that says so.
   */
  function handleSelectGarment() {
    if (!workingImage) return;
    setError(null);

    let selection;
    try {
      selection = selectGarment(workingImage, DEFAULT_TOLERANCE);
    } catch {
      // getImageData throws on a tainted canvas, exactly like toBlob does
      // (APRENDIZAJES §5.9b).
      setError(
        "No se pudo leer la imagen para seleccionar la prenda. Recarga la página e inténtalo de nuevo."
      );
      return;
    }

    if (!isUsefulSelection(selection)) {
      // Dos motivos distintos, y conviene decir cuál: si el fondo y la prenda
      // son casi del mismo color no hay tolerancia que lo arregle, y mandar al
      // usuario a "probar con otra imagen" sería mandarlo a perder el tiempo.
      setError(
        selection.contrast < CONTRASTE_MINIMO
          ? "La prenda y el fondo son casi del mismo color, así que no se pueden separar solos. Píntala con el pincel."
          : "No se pudo distinguir la prenda del fondo. Píntala con el pincel, o usa una imagen con el fondo despejado."
      );
      return;
    }

    pushUndo(mask);
    setMask((current) => ({ ...current, selection: selection.shape }));
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

    resetMask();
    notify({ type: "success", message: "Color aplicado." });
    router.refresh();
  }

  return (
    <div className={styles.workspace}>
      {hasBrush && (
        <MaskTools
          tool={tool}
          onToolChange={setTool}
          brush={brush}
          onBrushChange={setBrush}
          onClear={clearMask}
          onUndo={handleUndo}
          canUndo={undoStack.length > 0}
          // Offered only where it answers the right question, and only where it
          // can work at all. Both reasons are in `garmentSelectFits`.
          // Painting changes pixels, so it gets the tools that change
          // pixels. Marking a zone for the model does not, so it keeps the two
          // it actually uses.
          tools={
            isPainting
              ? ["brush", "flat", "picker", "eraser"]
              : ["brush", "eraser"]
          }
          // The same stroke, two meanings: cloth recoloured, or a region
          // declared. The rail says which one out loud.
          brushAction={isPainting ? "recolor" : "mask"}
          onSelectGarment={isPainting ? handleSelectGarment : undefined}
          selectGarmentBlockedReason={
            garmentSelectFits
              ? undefined
              : "La selección automática separa la prenda de un fondo liso. Esta imagen es una foto de modelo, así que seleccionaría a la persona entera. Píntala con el pincel."
          }
          isEmpty={isMaskEmpty(mask)}
          disabled={!canPaint}
        />
      )}

      <div className={styles.canvasColumn}>
        <div className={styles.stageBox} ref={containerRef}>
          {/* El velo vive en `WorkingOverlay` desde que la prueba virtual
              necesitó el mismo: se midió acá primero, y dos copias de una
              animación son dos animaciones que se separan con el tiempo. */}
          {isGenerating && <WorkingOverlay label="Generando…" />}
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
                Recarga la página. Si persiste, revisa la consola del navegador:
                ahí queda la dirección de la imagen que falló.
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
                  image={stageImage}
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
                    // **Fantasma fuera del modo de logotipos**, y la razón
                    // no es estética. La IA recibe la imagen de trabajo, y los
                    // logotipos NO son parte de ella: son capas que se aplican
                    // encima al componer. Dibujarlos opacos mientras alguien
                    // pinta o enmascara le muestra una prenda que el modelo
                    // nunca va a ver, y lo invita a pintar "alrededor" de algo
                    // que para el modelo no existe.
                    //
                    // Se atenúan en vez de ocultarse porque saber dónde va a
                    // caer el logotipo sí es útil mientras se decide qué
                    // limpiar. El panel dice en palabras lo que la opacidad
                    // insinúa.
                    opacity={isComposing ? 1 : 0.35}
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
                  visible={isComposing}
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

              {/* One signal at a time, EXCEPT while the pointer is down.
                  Between gestures the recolour is the better answer — it shows
                  what the garment will actually look like, in the real colour,
                  over exactly the same region — so the overlay steps aside
                  rather than tinting it, because two translucent layers of
                  different colours over the same pixels read as a third.

                  But during a stroke the question is not "what will it look
                  like", it is "where is the paint landing", and only the
                  overlay answers that. Without this, a stroke painted onto an
                  already-recoloured garment left no trace at all until the next
                  pass — which is exactly how a working brush comes to look
                  broken. */}
              {hasBrush && (isDrawing || !activeRecolor) && !isExporting && (
                <MaskLayer
                  mask={mask}
                  naturalWidth={naturalWidth}
                  naturalHeight={naturalHeight}
                  color={designToken("--color-accent")}
                />
              )}

              {/* Above the overlay, because it describes the next stroke and
                  not the ones already painted. Not while exporting: it is a
                  cursor, and a cursor baked into a PNG is a defect. */}
              {/* Not for the eyedropper: it has no width, so a circle showing
                  one would describe a gesture it does not make. */}
              {hasBrush && canPaint && tool !== "picker" && !isExporting && (
                <BrushCursor
                  brush={brush}
                  naturalWidth={naturalWidth}
                  isEraser={tool === "eraser"}
                  color={designToken("--color-accent")}
                />
              )}
            </Stage>
          )}
        </div>

        {/* Below the canvas, where a filmstrip goes: it is the chronology of
            the image above it. Inside the rail it would have competed with the
            tools for the same narrow column. */}
        <StepStrip
          steps={steps}
          currentId={currentAssetId ?? workingAssetId}
          selectedId={selectedStepId}
          onSelect={setSelectedStepId}
          onResume={handleResume}
          isResuming={isResuming}
          canEdit={canEdit}
        />
      </div>

      <div className={styles.panel}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {/* A select and not a row of buttons, which is what this was while
            there were two modes. At four they stopped fitting the rail without
            wrapping, and more importantly a row of pills reads as "four things
            you can do at once" when only one is ever active. A select shows the
            current mode in words and hides the rest until asked.

            Not PillTabs, not Menu: PillTabs is the row this replaces, and Menu
            is for actions — it never shows which one is in effect, which is the
            only thing a mode control has to say. */}
        {canEdit && (
          <div className={styles.group}>
            <span className={styles.groupLabel} id={modeLabelId}>
              Qué estoy editando
            </span>
            <select
              className={styles.modeSelect}
              aria-labelledby={modeLabelId}
              value={mode}
              onChange={(event) => changeMode(event.target.value as WorkspaceMode)}
            >
              {/* **El orden es el del flujo, y los logotipos van últimos.**
                  Lo generativo deforma lo que esté estampado en la prenda, así
                  que componer el logotipo es el último paso antes de presentar
                  (`FASE_2_INPAINTING` §5, el flujo decidido). Ponerlo primero
                  invitaba a colocarlo y después editar la prenda debajo.

                  Las capas sobreviven a ese error, porque sus coordenadas son
                  proporciones y no píxeles (migración 013), pero una
                  composición ya creada no: es un aplanado, y queda vieja. */}
              <option value="zones">Editar por zonas</option>
              <option value="instruction">Editar por instrucción</option>
              <option value="paint">Pintar prenda</option>
              <option value="logos">Componer logos</option>
            </select>
          </div>
        )}

        {/* Only the active mode's panel. Showing both was the prototype's
            layout and was discarded (FASE_1_5 §7.5): two tasks competing for
            attention leave the canvas squashed between them. */}
        {/* Rendered from the moment the mode opens, not when the first stroke
            lands. Appearing on the first drag resized the panel — and therefore
            the canvas — in the middle of the gesture that created it, which
            moved the garment out from under the brush. */}
        {isPainting && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Color de la prenda</span>
            {/* Repetida aqui a proposito: el riel mide 56px y el tooltip de un
                boton deshabilitado no existe en tactil. Este es el unico lugar
                donde el motivo se puede leer sin un puntero. */}
            {!garmentSelectFits && (
              <p className={styles.hint}>
                La selección automática está desactivada. Separa la prenda de un
                fondo liso, y esta imagen es una foto de modelo: seleccionaría a
                la persona entera. Pinta la prenda con el pincel.
              </p>
            )}
            <ColorPanel
              color={color}
              onColorChange={setColor}
              onApply={handleApplyColor}
              onDiscard={clearMask}
              hasMask={!isMaskEmpty(mask)}
              isApplying={isApplyingColor}
              disabled={!canPaint}
            />
          </div>
        )}

        {/* Two ways to change the same painted region, and the split the user
            perceives is the one they already think in: change the COLOUR, or
            change the TELA. That one is exact and free and the other calls a
            model is an engineering decision they never have to hold. */}
        {isInstructing && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Cambiar con IA</span>
            <InstructionPanel
              instruction={instruction}
              onInstructionChange={setInstruction}
              onGenerate={handleInstructionGenerate}
              isGenerating={isGenerating}
              isSimulated={isSimulated}
              disabled={!canCompose}
            />
          </div>
        )}

        {isZones && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Cambiar con IA</span>
            <GenerationPanel
              intent={intent}
              // Nothing is proposed on switching any more. It used to drop the
              // picker's hex in when the colour intent was chosen, so both
              // paths were asked for the same colour and the comparison meant
              // something. That intent is gone: the comparison was run, the
              // model does not honour an exact colour, and the answer is in
              // `EXPERIMENTO_1_color_generativo.md` rather than in a control.
              onIntentChange={setIntent}
              description={description}
              onDescriptionChange={setDescription}
              onGenerate={handleGenerate}
              hasMask={!isMaskEmpty(mask)}
              isGenerating={isGenerating}
              isSimulated={isSimulated}
              disabled={!canPaint}
            />
          </div>
        )}

        {/* The logo panels used to be on screen in every mode, so "Editar
            prenda" showed four groups belonging to the other module. A mode
            that does not change what the rail offers is a label, not a mode. */}
        {isComposing && (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Logotipos</span>
          <LogoPicker
            logos={availableLogos}
            onAdd={handleAddLogo}
            onUpload={handleLogoFile}
            isUploading={isUploadingLogo}
            canAdd={canManipulate && !isBusy}
            canUpload={canEdit && !isUploadingLogo && !isCutting}
            canEdit={canEdit}
          />
        </div>
        )}

        {isComposing && selectedLayer && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Fondo del logotipo</span>
            <LogoBackground
              isBroken={!selectedImage || selectedImage === "error"}
              isCutOut={selectedIsCutOut}
              isCutting={cutLayerId === selectedLayer.id}
              tolerance={tolerance}
              onToleranceChange={setTolerance}
              preview={preview}
              isApplying={isApplyingCut}
              onStart={() => handleStartCut(selectedLayer.id)}
              onCancel={handleCancelCut}
              onApply={handleApplyCut}
              canStart={canCompose}
              canEdit={canEdit}
            />
          </div>
        )}

        {isComposing && (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Capas</span>
          <LayerList
            layers={layers}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={handleRemoveLayer}
            brokenIds={brokenLayerIds}
            cutLayerId={cutLayerId}
            canEdit={canEdit}
          />
        </div>
        )}

        {/* Dicho en palabras, no solo insinuado con la opacidad: lo que se
            ve atenuado sobre la prenda no está en la imagen, y el modelo no lo
            recibe. Sin esta línea, un logotipo a medio tono se lee como "ahí
            está, más clarito". */}
        {!isComposing && layers.length > 0 && (
          <p className={styles.ghostNote}>
            Los logotipos se ven de referencia. Todavía no son parte de la
            imagen, así que la IA no los recibe y se aplican al componer.
          </p>
        )}

        {isComposing && (
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

          {/* Visible y no un tooltip sobre el botón muerto: un control
              deshabilitado no dispara hover de forma confiable y nunca lo hace
              en táctil. Tercera vez que se aplica la misma corrección. */}
          {canManipulate && layers.length === 0 && !isExporting && (
            <p className={styles.hint}>
              Coloca al menos un logotipo para poder crear la composición.
            </p>
          )}
        </div>
        )}
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
  /** Atenuada fuera del modo de logotipos: ver el uso en el lienzo. */
  opacity: number;
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
  opacity,
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
      opacity={opacity}
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
