import "server-only";
import { mockProvider } from "@/lib/generation/mock";
import type { GenerationProvider } from "@/lib/generation/types";

export type {
  GenerationOutcome,
  GenerationProvider,
  InpaintIntent,
  InpaintRequest,
  InpaintResult,
} from "@/lib/generation/types";

/**
 * Which provider answers, decided in exactly one place.
 *
 * `server-only` because a provider holds the API key. Nothing under
 * `components/` may import this file — screens talk to
 * `POST /api/generate/inpainting`, and that route talks to this.
 *
 * **Today it is always the mock**, and that is a deliberate stage and not an
 * oversight: `FASE_2_INPAINTING` §7 puts the whole interface before the first
 * paid call. When Runware arrives it is a second module implementing
 * `GenerationProvider` and one branch here — no screen changes, because no
 * screen ever knew a provider existed.
 *
 * The switch is an env var and not a code edit so the same build can be pointed
 * at either one: a demo runs free, a validation session runs real.
 */
export function getGenerationProvider(): GenerationProvider {
  // RUNWARE_API_KEY is intentionally not read yet. Adding the branch before the
  // provider exists would make it look like a real call is one variable away.
  return mockProvider;
}

/**
 * True while generations are free. The UI says so out loud rather than showing
 * a fake price as if it were real: a simulated cost presented like a real one
 * is the kind of number that ends up quoted in a report.
 */
export function isSimulated(): boolean {
  return !getGenerationProvider().billable;
}
