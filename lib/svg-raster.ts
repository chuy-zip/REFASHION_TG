/**
 * Turning an SVG logo into a PNG, in the browser, at upload time.
 *
 * A corporate logo is the canonical vector graphic and it is what the client
 * hands over; a small raster one visibly pixelates when scaled over a garment
 * (FASE_1_5 §9.3c). What is *not* obvious is that accepting SVG does not have
 * to mean storing SVG, and storing it is where the cost lives:
 *
 * - **Drawing.** A browser rasterises an SVG image at whatever size it decides,
 *   so a vector drawn large on the canvas is not reliably crisp. Writing the
 *   dimensions ourselves and rasterising once removes the guesswork: the image
 *   is born at the size we asked for and every later draw is a downscale.
 * - **Dimensions.** An SVG without `viewBox` reports a different intrinsic size
 *   in each browser (0 in some, 300×150 in others), which downstream turns into
 *   a layer with a `NaN` height that silently fails to draw. Here it is a
 *   rejection at upload with a readable reason instead.
 * - **Security.** An SVG is XML and may carry `<script>`. Today the mitigation
 *   is a rule to remember ("never insert it into the DOM"); converting removes
 *   the object entirely, so after upload there is no SVG in the system to
 *   serve, open or inline. The markup below is parsed inert, used once, and
 *   dropped.
 *
 * Known limitation, inherent to the technique and not to this code: an SVG
 * loaded as an image cannot fetch external resources, so a logo whose text was
 * never converted to outlines will rasterise with a fallback font or without
 * the text. The upload copy says so.
 */

export const SVG_MIME_TYPE = "image/svg+xml";

/**
 * Long edge of the raster. A logo placed at a quarter of a 4000 px garment is
 * 1000 px, so this leaves room to scale it up without the pixelation that
 * motivated accepting vectors in the first place.
 */
const RASTER_LONG_EDGE = 2048;

export type RasterResult =
  | { ok: true; blob: Blob }
  | { ok: false; error: string };

/**
 * Some browsers hand over an empty `type` for files they do not recognise, so
 * the extension is a second chance rather than a redundancy.
 */
export function isSvgFile(file: File): boolean {
  return (
    file.type === SVG_MIME_TYPE || file.name.toLowerCase().endsWith(".svg")
  );
}

/** A length that means pixels: unitless, or explicitly `px`. */
function pixelLength(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i.exec(value);
  if (!match) return null;
  const length = Number(match[1]);
  return Number.isFinite(length) && length > 0 ? length : null;
}

/** `viewBox="minX minY width height"`, separated by spaces or commas. */
function viewBoxSize(svg: Element): { width: number; height: number } | null {
  const raw = svg.getAttribute("viewBox");
  if (!raw) return null;

  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [, , width, height] = parts;
  return width > 0 && height > 0 ? { width, height } : null;
}

export async function rasterizeSvgToPng(file: File): Promise<RasterResult> {
  const markup = await file.text();
  const parsed = new DOMParser().parseFromString(markup, SVG_MIME_TYPE);

  if (
    parsed.querySelector("parsererror") ||
    parsed.documentElement.nodeName.toLowerCase() !== "svg"
  ) {
    return { ok: false, error: "El archivo no es un SVG válido." };
  }

  const svg = parsed.documentElement;

  // Not because it could run — an <img> never executes script inside an SVG —
  // but so that nothing in the markup handed to the loader depends on that
  // being true.
  for (const script of Array.from(svg.querySelectorAll("script"))) {
    script.remove();
  }

  // The viewBox is what makes the drawing scale when the size changes. Without
  // it, overwriting width/height would enlarge the canvas and leave the artwork
  // its original size in the corner, so one is synthesised from the declared
  // dimensions when they are the only thing available.
  const box = viewBoxSize(svg);
  const declaredWidth = pixelLength(svg.getAttribute("width"));
  const declaredHeight = pixelLength(svg.getAttribute("height"));

  let source = box;
  if (!source && declaredWidth && declaredHeight) {
    source = { width: declaredWidth, height: declaredHeight };
    svg.setAttribute("viewBox", `0 0 ${declaredWidth} ${declaredHeight}`);
  }

  if (!source) {
    return {
      ok: false,
      error:
        "El SVG no declara sus dimensiones. Necesita un atributo viewBox, o un ancho y alto en píxeles.",
    };
  }

  const aspect = source.width / source.height;
  const width = Math.max(
    1,
    Math.round(aspect >= 1 ? RASTER_LONG_EDGE : RASTER_LONG_EDGE * aspect)
  );
  const height = Math.max(
    1,
    Math.round(aspect >= 1 ? RASTER_LONG_EDGE / aspect : RASTER_LONG_EDGE)
  );

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  const sized = new XMLSerializer().serializeToString(svg);
  // A blob: URL is same-origin, so the canvas below is never tainted and none
  // of the CORS machinery the R2 images need applies here.
  const url = URL.createObjectURL(new Blob([sized], { type: SVG_MIME_TYPE }));

  try {
    const image = await loadImage(url);
    if (!image) {
      return {
        ok: false,
        error: "No se pudo leer el SVG. Puede estar dañado.",
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return { ok: false, error: "No se pudo convertir el SVG a PNG." };
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );

    return blob
      ? { ok: true, blob }
      : { ok: false, error: "No se pudo convertir el SVG a PNG." };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
