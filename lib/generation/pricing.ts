/**
 * What each path costs, measured rather than quoted.
 *
 * **No `server-only` here, and that is the point of the file existing.** These
 * numbers have to be readable by a panel that shows a price *before* the button
 * is pressed, and every other file in this folder holds an API key. Splitting
 * the constants out is what lets the screen say the price without importing a
 * provider.
 *
 * **Every figure is what Runware actually charged**, read from `includeCost` on
 * real calls, not from a catalogue and never from a product page. That
 * distinction was earned: for the try-on model the product page said $0.0150,
 * the catalogue said $0.0069, and the invoice said **$0.0045**. The rule the
 * project ended with is that a published price is an approximation and only
 * `includeCost` is a measurement (`herramientas/docs/EXPERIMENTO_4_vton.md`).
 *
 * So these are approximations too, in one direction only: they are what was
 * charged for the images that were measured. Two of the three models bill by
 * resolution, so a larger image costs more, which is why the UI says "unos"
 * and why the row stores the real number afterwards.
 */

/**
 * FLUX.1 Fill [dev] on a mask, at about 1.2 MP.
 * Measured across the removal experiments.
 */
export const INPAINT_COST_USD = 0.0038;

/**
 * FLUX.1 Kontext [dev] by instruction, same image.
 *
 * About 3.4 times the mask path, which is the reason the instruction panel says
 * so out loud instead of letting someone find out from the running total.
 */
export const EDIT_COST_USD = 0.013;

/**
 * P-Image-Try-On, and this one does not vary.
 *
 * Five measured calls charged $0.0045 each, including one with a person photo
 * three times larger than the others. Unlike the two above, this model does not
 * bill by megapixel, so the figure shown before the call is the figure charged.
 */
export const TRY_ON_COST_USD = 0.0045;
