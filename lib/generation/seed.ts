/**
 * The number that makes a generation repeatable.
 *
 * Diffusion starts from noise, and which noise it starts from is the seed. Two
 * requests with identical images, mask and prompt but different seeds come back
 * different — so without recording it, no result can ever be reproduced, and no
 * two results can be honestly compared.
 *
 * **This was learned the expensive way.** The first round of paid experiments
 * ran without fixing it, and its conclusions had to be retracted: part of every
 * difference attributed to a parameter was just a different starting noise. The
 * round that did fix it produced an attribution clean enough to act on
 * (`herramientas/docs/EXPERIMENTO_3_quitar_y_agregar.md`).
 *
 * For this project it matters twice over. A report has to be reproducible by
 * whoever reads it. And a client who approves a design and comes back a week
 * later expects the same garment, not a near miss.
 */

/** Runware takes a 32-bit unsigned integer. */
const MAX_SEED = 4_294_967_295;

/**
 * A fresh seed for a generation that did not ask for a particular one.
 *
 * `crypto` rather than `Math.random` for no cryptographic reason at all: it is
 * simply the one that is available identically on both sides and does not need
 * seeding itself.
 */
export function newSeed(): number {
  // A Uint32Array element is already 0..MAX_SEED, so there is nothing to clamp
  // or fold. Writing a modulo here would look like it did something.
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** True when a value can be sent as a seed. */
export function isSeed(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_SEED;
}
