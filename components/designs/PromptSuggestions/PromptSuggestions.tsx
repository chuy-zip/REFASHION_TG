"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import {
  INTENT_COPY,
  PROMPT_LANGUAGE_COPY,
  PROMPT_SUGGESTIONS,
  type PromptLanguage,
} from "@/lib/generation/prompt";
import type { InpaintIntent } from "@/lib/generation/types";
import styles from "./PromptSuggestions.module.css";

interface PromptSuggestionsProps {
  intent: InpaintIntent;
  open: boolean;
  onClose: () => void;
  /** Puts the chosen text in the box, where it can still be edited. */
  onUse: (text: string) => void;
}

/**
 * The wording that was measured to work, offered instead of imposed.
 *
 * **This replaces a hidden frame.** What the user typed used to be wrapped in
 * extra sentences they never saw, which made the request unreadable and a bad
 * result undiagnosable. The sentences were worth keeping; the secrecy was not.
 * Choosing one here drops the full text into the box, where it stays editable
 * and where what is on screen is what will be sent.
 *
 * **Both languages, because the answer is not known.** The first experiment
 * measured English beating Spanish on the same request, but on the colour task
 * that was later abandoned for other reasons, so it does not transfer. Offering
 * both turns a guess into something the user can compare for themselves.
 *
 * The examples are long on purpose and it is the length that carries the
 * lesson: each one names the ten properties the measured-good prompt named
 * (material, finish, weave, thread direction, folds, shading, tone, thread
 * scale, lighting, edge sharpness), and none of them lists what it does not
 * want — this model has no negative channel, so a "no logo" is read as "logo".
 */
export function PromptSuggestions({
  intent,
  open,
  onClose,
  onUse,
}: PromptSuggestionsProps) {
  const [language, setLanguage] = useState<PromptLanguage>("es");

  const examples = PROMPT_SUGGESTIONS[intent][language];

  return (
    <Dialog open={open} onClose={onClose} labelledBy="prompt-suggestions-title">
      <div className={styles.content}>
        <div>
          <h2 className={styles.title} id="prompt-suggestions-title">
            Sugerencias para {INTENT_COPY[intent].label.toLowerCase()}
          </h2>
          <p className={styles.hint}>{INTENT_COPY[intent].hint}</p>
        </div>

        <PillTabs
          label="Idioma de la sugerencia"
          selected={language}
          onSelect={(key) => setLanguage(key as PromptLanguage)}
          options={(Object.keys(PROMPT_LANGUAGE_COPY) as PromptLanguage[]).map(
            (key) => ({ key, label: PROMPT_LANGUAGE_COPY[key] })
          )}
        />

        <p className={styles.note}>
          Elige una y quedará en el cuadro de texto. Puedes cambiarla antes de
          generar: lo que quede escrito es exactamente lo que se le pide al
          modelo.
        </p>

        <ul className={styles.list}>
          {examples.map((example) => (
            <li key={example} className={styles.item}>
              <p className={styles.example}>{example}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  onUse(example);
                  onClose();
                }}
              >
                Usar esta
              </Button>
            </li>
          ))}
        </ul>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
