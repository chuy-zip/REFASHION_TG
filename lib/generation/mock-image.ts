import "server-only";
import { deflateSync } from "node:zlib";

/**
 * A PNG encoder small enough to be worth writing instead of installing.
 *
 * The mock provider has to hand back a real image: the whole point of building
 * against it is that the rest of the pipeline — R2, the asset row, the strip,
 * the cursor — runs exactly as it will with Runware. A placeholder URL would
 * skip the half that actually breaks.
 *
 * Truecolor, 8 bits, no interlace, one deflate stream. That is the entire
 * subset needed here, and it keeps the project's rule of not adding a
 * dependency for something this contained (same call as `lib/svg-raster.ts`
 * and `lib/background-removal.ts`).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBytes, Buffer.from(data)]);

  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Encodes raw RGB (three bytes per pixel, row-major) as a PNG.
 * Every scanline gets filter byte 0: the images this produces are flat bands,
 * where a smarter filter would buy nothing.
 */
function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Stable 32-bit hash, so the same prompt always yields the same image. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hueToRgb(hue: number): Rgb {
  // Fixed saturation and lightness: what has to vary between one mock result
  // and the next is only the hue, so two steps in the strip are told apart at a
  // glance without any of them looking like a real garment.
  const c = 0.55;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.28;

  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
      ? [x, c, 0]
      : hue < 180
      ? [0, c, x]
      : hue < 240
      ? [0, x, c]
      : hue < 300
      ? [x, 0, c]
      : [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * The image the mock hands back: a flat field in a colour derived from the
 * prompt, crossed by diagonal bands.
 *
 * Deliberately **not** a plausible garment. A convincing fake would make it
 * easy to forget which provider is answering, and the one thing this image has
 * to communicate at a glance is "nothing was generated, this came from the
 * simulator". The colour still varies per prompt so the strip fills with
 * visibly different steps and the cursor has something to point at.
 */
export function renderMockResult(
  width: number,
  height: number,
  prompt: string
): Blob {
  const seed = hash(prompt);
  const base = hueToRgb(seed % 360);
  const band: Rgb = {
    r: Math.round(base.r * 0.82),
    g: Math.round(base.g * 0.82),
    b: Math.round(base.b * 0.82),
  };

  const rgb = new Uint8Array(width * height * 3);
  const period = 96;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const diagonal = (x + y) % period;
      const c = diagonal < period / 2 ? base : band;
      const i = (y * width + x) * 3;
      rgb[i] = c.r;
      rgb[i + 1] = c.g;
      rgb[i + 2] = c.b;
    }
  }

  const png = encodePng(width, height, rgb);
  return new Blob([new Uint8Array(png)], { type: "image/png" });
}
