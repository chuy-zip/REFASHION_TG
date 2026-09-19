/**
 * Changing the colour of a masked region, in the browser, without generating
 * anything (Módulo 2).
 *
 * `FASE_2_INPAINTING` §2.3 chose this after finding that **diffusion models do
 * not honour colour codes reliably** — an open research problem, not a
 * limitation of one provider (ColorPeel, arXiv 2407.07197). An exact blue in
 * the prompt comes back as *a* dark blue, not **that** blue. For a quoting tool the
 * colour is the deliverable: a client who approves one blue and receives
 * another has a complaint, not a preference.
 *
 * So the colour has two paths and this is the exact one: the hex that comes out
 * is the hex that went in, it costs nothing, and it is instant enough to
 * preview while the picker moves. The generative path stays for what this
 * cannot do — printed patterns, a change of material, a different collar.
 *
 * **How it keeps the fabric.** A garment photo carries its folds and shadows in
 * its *luminance*, not its hue. So each pixel keeps its own brightness relative
 * to the region's average, and only takes the new hue and saturation. Flatten
 * the luminance instead and the shirt turns into a paper cut-out.
 *
 * That relative brightness is a **shading factor**, and the model behind it is
 * the one that holds for matte fabric: `pixel = colour × shading`. It is right,
 * and it is also where the method used to break — because the shading does not
 * always fit.
 *
 * **Why a black shirt could not become a light one.** On a black garment the
 * folds run from luma 10 to 96 around a mean of 32, so the brightest of them
 * carries a shading factor of 3. Asked for a light yellow (luma 229) the
 * physical answer is 229 × 3, and every channel lands past 255. Two things
 * broke at once there: the highlights **flattened into one white patch**,
 * because everything above the mean clipped to the same value; and the **hue
 * drifted before it got there**, because each channel reaches 255 at a
 * different factor — a yellow clips red at 1.02× and blue at 1.42×, so it goes
 * pale before it goes white.
 *
 * Nothing was wrong with the picker and nothing was wrong with the colour. The
 * distance in brightness between the colour and the garment is what decides it,
 * which is why the same picker looked right for every dark colour: navy on
 * black needs a factor of 1.34 and it fits.
 *
 * **Two bounds fix it, and both are one line.** The fold contrast is never more
 * than the physical model asks for, and never more than the headroom allows —
 * `foldScale()`. When the physical answer fits, this returns exactly what it
 * always did, pixel for pixel. When it does not, the folds are compressed into
 * the room there is instead of being flattened against the ceiling.
 *
 * And where a channel still goes past 255, `clipColor()` desaturates towards
 * the pixel's own luminance rather than clipping each channel on its own. That
 * is the W3C Compositing and Blending Level 1 rule, and it is what turns a hue
 * drift into what a highlight actually looks like.
 *
 * Same family as `lib/background-removal.ts`: pure, synchronous, no dependency,
 * no network — and the same CORS caveat, since `getImageData()` throws on a
 * tainted canvas exactly like `toBlob()` does (APRENDIZAJES §5.9b).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#RRGGBB` (or `#RGB`) to channels. Null when the string is not a colour. */
export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "");

  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const pair = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${pair(r)}${pair(g)}${pair(b)}`.toUpperCase();
}

/**
 * Rec. 709 luma. Weighted, not a plain average, because the eye is far more
 * sensitive to green than to blue: an unweighted mean makes a yellow fold and a
 * blue one read as different depths when they are the same.
 */
function luma({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Where the folds stop and the sheen begins. The top half-percent of a garment
 * photo is specular highlight and JPEG ringing, not fabric.
 */
const HIGH_PERCENTILE = 0.995;

/** The luma below which `share` of the region's pixels fall. */
function percentile(
  histogram: Uint32Array,
  count: number,
  share: number
): number {
  const wanted = count * share;
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value];
    if (seen >= wanted) return value;
  }
  return histogram.length - 1;
}

/**
 * Brings a colour back inside 0..255 **without changing its luminance**, by
 * pulling it towards its own grey.
 *
 * The naive alternative — clamping each channel on its own — is what makes a
 * bright yellow turn white through pale green: red saturates first, then green,
 * and for a moment the pixel is a colour nobody asked for. Scaling the whole
 * chroma down around the luminance keeps the hue and only spends saturation,
 * which is what a real highlight does.
 *
 * W3C Compositing and Blending Level 1, `ClipColor`.
 */
function clipColor(color: Rgb): Rgb {
  const l = luma(color);
  const channels = [color.r, color.g, color.b];
  const low = Math.min(...channels);
  const high = Math.max(...channels);

  let result = color;

  if (low < 0) {
    const range = l - low;
    if (range <= 0) return { r: l, g: l, b: l };
    const pull = (v: number) => l + ((v - l) * l) / range;
    result = { r: pull(result.r), g: pull(result.g), b: pull(result.b) };
  }

  if (high > 255) {
    const range = high - l;
    if (range <= 0) return { r: l, g: l, b: l };
    const pull = (v: number) => l + ((v - l) * (255 - l)) / range;
    result = { r: pull(result.r), g: pull(result.g), b: pull(result.b) };
  }

  return result;
}

/**
 * How much fold contrast the new colour can carry: **the smaller of what the
 * physics asks for and what the headroom allows.**
 *
 * The first bound is `targetLuma / referenceLuma`, which is the slope of the
 * multiplicative model — ask for no more contrast than the fabric actually has.
 * Taking only this one is what used to blow out a light colour on a dark shirt.
 *
 * The second is the room left above the target before 255, divided by how far
 * the brightest fold reaches above the region's mean. It is what says "this
 * colour has 26 levels of headroom and the folds need 64, so they go in at
 * 41%".
 *
 * There is no third bound for the shadows. It would be `targetLuma /
 * (referenceLuma - lowLuma)`, and since `lowLuma` is never negative that is
 * always at least the physical slope — it could never bind, so it is not
 * written.
 */
function foldScale(
  referenceLuma: number,
  highLuma: number,
  targetLuma: number
): number {
  const physical = targetLuma / Math.max(referenceLuma, 1);
  const headroom = highLuma > referenceLuma
    ? (255 - targetLuma) / (highLuma - referenceLuma)
    : Infinity;
  return Math.min(physical, headroom);
}

export interface Hsl {
  /** Degrees, 0..360. */
  h: number;
  /** Percent, 0..100. */
  s: number;
  /** Percent, 0..100. */
  l: number;
}

/**
 * RGB to HSL, for the panel's numeric controls.
 *
 * Hue, saturation and lightness are the three axes a person actually reasons
 * about — "the same blue but lighter" is one number here and three there. It
 * lives in this file because it is colour arithmetic, next to `parseHex` and
 * `luma`, and because the lightness it exposes is the very quantity
 * `foldScale` is bounded by.
 */
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const span = max - min;
  const l = (max + min) / 2;

  if (span === 0) return { h: 0, s: 0, l: l * 100 };

  const s = span / (l > 0.5 ? 2 - max - min : max + min);

  const h =
    max === rn
      ? ((gn - bn) / span + (gn < bn ? 6 : 0))
      : max === gn
      ? (bn - rn) / span + 2
      : (rn - gn) / span + 4;

  return { h: h * 60, s: s * 100, l: l * 100 };
}

/** HSL back to RGB. Exact inverse of `rgbToHsl` up to rounding. */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = s / 100;
  const ln = l / 100;

  const chroma = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((hp % 2) - 1));
  const m = ln - chroma / 2;

  const [r, g, b] =
    hp < 1 ? [chroma, x, 0]
    : hp < 2 ? [x, chroma, 0]
    : hp < 3 ? [0, chroma, x]
    : hp < 4 ? [0, x, chroma]
    : hp < 5 ? [x, 0, chroma]
    : [chroma, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export interface RecolorOptions {
  /** The garment, already loaded and CORS-clean. */
  image: HTMLImageElement;
  /**
   * Where to recolour: white means change, black means keep, grey blends.
   * Same convention as the inpainting mask, so one painted mask drives both
   * paths and the user never learns that there are two.
   */
  mask: HTMLCanvasElement;
  /** The colour the user picked, exactly. */
  target: Rgb;
}

/**
 * Returns a new canvas with the masked region recoloured.
 *
 * The source image is never touched: like the background removal, this produces
 * a new image and leaves the original alone, because the original may be the
 * working image of other steps in the strip.
 */
export function recolorRegion({
  image,
  mask,
  target,
}: RecolorOptions): HTMLCanvasElement {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, width, height);
  const pixels = frame.data;

  // The mask is painted at canvas scale, which is not the image's scale. Rather
  // than resample it by hand, let the 2D context do it: drawing it into a
  // buffer the size of the image is one call and uses the browser's own
  // smoothing.
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskCtx) return canvas;
  maskCtx.drawImage(mask, 0, 0, width, height);
  const maskPixels = maskCtx.getImageData(0, 0, width, height).data;

  // First pass: how bright the region being recoloured actually is, and how far
  // its folds reach. Both have to come from the region itself and not from the
  // whole image — a white shirt on a dark background would otherwise come out
  // washed out, because the background would drag the reference down.
  //
  // A histogram rather than a running min/max: the top of the range is taken as
  // a percentile, and a single specular pixel must not be allowed to decide how
  // much contrast the whole garment gets. It costs one pass and 256 numbers.
  const histogram = new Uint32Array(256);
  let sum = 0;
  let count = 0;

  for (let i = 0; i < maskPixels.length; i += 4) {
    if (maskPixels[i] < 8) continue;
    const value = luma({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
    sum += value;
    count += 1;
    histogram[Math.min(255, Math.max(0, Math.round(value)))] += 1;
  }

  if (count === 0) return canvas;

  const referenceLuma = sum / count;

  // Guard against a division by ~0 on an almost-black region.
  const safeReference = Math.max(referenceLuma, 1);
  // And on a black target, where every fold is black by definition: the ratio
  // below would be 0/0 without it.
  const targetLuma = luma(target);
  const safeTarget = Math.max(targetLuma, 1);

  // Where the brightest folds sit. Not the maximum: the brightest half-percent
  // of a garment photo is sheen and compression artefacts, and letting it set
  // the scale would compress everything else to protect a handful of pixels.
  const highLuma = percentile(histogram, count, HIGH_PERCENTILE);

  const scale = foldScale(referenceLuma, highLuma, targetLuma);

  for (let i = 0; i < pixels.length; i += 4) {
    const weight = maskPixels[i] / 255;
    if (weight === 0) continue;

    const original = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };

    // The fold, kept as a distance from the region's mean and scaled by what
    // the new colour can carry. At the mean this is exactly the target, which
    // is what keeps the promise that the hex asked for is the hex delivered.
    const foldLuma = Math.max(
      0,
      targetLuma + (luma(original) - safeReference) * scale
    );

    // Multiplicative, as before: scaling all three channels together is what
    // preserves the chromaticity of matte fabric. The only thing that changed
    // is that the factor now comes from a bounded luminance instead of an
    // unbounded one.
    const ratio = foldLuma / safeTarget;

    const recolored = clipColor({
      r: target.r * ratio,
      g: target.g * ratio,
      b: target.b * ratio,
    });

    // Grey in the mask blends, so a feathered edge does not leave a hard seam
    // between the recoloured region and the rest of the garment.
    pixels[i] = original.r + (recolored.r - original.r) * weight;
    pixels[i + 1] = original.g + (recolored.g - original.g) * weight;
    pixels[i + 2] = original.b + (recolored.b - original.b) * weight;
  }

  ctx.putImageData(frame, 0, 0);
  return canvas;
}

/**
 * Paints the masked region in one flat colour, shading and all gone.
 *
 * **The opposite trade to `recolorRegion`, and both are wanted.** That one
 * keeps the folds because a garment that lost its shading reads as a sticker.
 * This one throws them away on purpose, because its job is not to look like
 * cloth: it is to **remove what was there** before the image is handed to a
 * model.
 *
 * That need was measured. An inpainting whose masked region still carried the
 * original structure came back with a ghost of it — the emblem's silhouette
 * survived in relief even though every gold pixel was gone. Covering the region
 * with flat colour first is what made the ghost disappear, and it is the same
 * move that turned a failed "make this sleeve long" into a working one
 * (`herramientas/docs/EXPERIMENTO_3_quitar_y_agregar.md`).
 *
 * So the two brushes are two intentions: **keep the garment, or hide something
 * from the model.** Shading is what separates them.
 *
 * Shares `RecolorOptions` because the inputs are identical, and the mask means
 * the same thing here: white changes, black keeps, grey blends. The blend is
 * what keeps a feathered edge from leaving a hard seam.
 */
export function fillRegion({
  image,
  mask,
  target,
}: RecolorOptions): HTMLCanvasElement {
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, width, height);
  const pixels = frame.data;

  // Same resampling route as `recolorRegion`: the mask is painted at canvas
  // scale, and letting the 2D context redraw it at image scale is one call
  // instead of a hand-written resample that could disagree with the other path.
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskCtx) return canvas;
  maskCtx.drawImage(mask, 0, 0, width, height);
  const maskPixels = maskCtx.getImageData(0, 0, width, height).data;

  for (let i = 0; i < pixels.length; i += 4) {
    const weight = maskPixels[i] / 255;
    if (weight === 0) continue;

    pixels[i] = pixels[i] + (target.r - pixels[i]) * weight;
    pixels[i + 1] = pixels[i + 1] + (target.g - pixels[i + 1]) * weight;
    pixels[i + 2] = pixels[i + 2] + (target.b - pixels[i + 2]) * weight;
  }

  ctx.putImageData(frame, 0, 0);
  return canvas;
}

/**
 * The colour of one pixel of an image, as a hex string.
 *
 * For the eyedropper. Reading it from the **source image** rather than from the
 * stage is deliberate: the stage may be showing a live recolour preview, and
 * sampling that would feed the picker a colour it produced itself, which drifts
 * a little further on every pick.
 *
 * Returns null on the same failure `recolorRegion` guards against: a tainted
 * canvas throws on `getImageData`, and here that has to be a value rather than
 * an exception because a click on a garment must never break the screen.
 */
export function samplePixel(
  image: HTMLImageElement,
  xRatio: number,
  yRatio: number
): string | null {
  const x = Math.round(xRatio * image.naturalWidth);
  const y = Math.round(yRatio * image.naturalHeight);
  if (x < 0 || y < 0 || x >= image.naturalWidth || y >= image.naturalHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return toHex({ r, g, b });
  } catch {
    return null;
  }
}
