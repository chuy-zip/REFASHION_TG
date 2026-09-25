import "server-only";
import { mockProvider } from "@/lib/generation/mock";
import { runwareProvider } from "@/lib/generation/runware";
import type { GenerationProvider } from "@/lib/generation/types";

export type {
  GenerationOutcome,
  GenerationProvider,
  InpaintMode,
  InpaintRequest,
  GenerationResult,
} from "@/lib/generation/types";

/**
 * Which provider answers, decided in exactly one place.
 *
 * `server-only` because a provider holds the API key. Nothing under
 * `components/` may import this file — screens talk to
 * `POST /api/generate/inpainting`, and that route talks to this.
 *
 * **The default is still the mock**, and that is a deliberate stage and not an
 * oversight: `FASE_2_INPAINTING` §7 put the whole interface before the first
 * paid call. Runware is a second module implementing `GenerationProvider` and
 * the branch below — no screen changed to add it, because no screen ever knew a
 * provider existed.
 *
 * The switch is an env var and not a code edit so the same build can be pointed
 * at either one: a demo runs free, a validation session runs real.
 */

/**
 * **The app has its own key, and that is what decides.**
 *
 * The obvious design is to spend whenever a Runware key is present, and the
 * obvious key is `RUNWARE_API_KEY`. That one would have been wrong, because it
 * has been sitting in `.env.local` since the experiments started: the Python
 * tools in `herramientas/` read it. Its presence means "I ran an experiment in
 * August", not "I want this app to spend", so keying off it would have switched
 * every local session onto a paid API without anyone deciding.
 *
 * A separate name fixes it without adding a second switch to get wrong.
 * `API_KEY_RUNWARE_PROD` exists only if someone put it there for the app, so
 * **presence is intent** and there is nothing else to remember. The tools keep
 * their key, untouched, and neither can turn the other on.
 */
export function getGenerationProvider(): GenerationProvider {
  return process.env.API_KEY_RUNWARE_PROD ? runwareProvider : mockProvider;
}

/**
 * True while generations are free. The UI says so out loud rather than showing
 * a fake price as if it were real: a simulated cost presented like a real one
 * is the kind of number that ends up quoted in a report.
 */
export function isSimulated(): boolean {
  return !getGenerationProvider().billable;
}
