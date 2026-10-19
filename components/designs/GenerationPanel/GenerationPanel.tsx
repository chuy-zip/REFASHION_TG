"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { PromptSuggestions } from "@/components/designs/PromptSuggestions/PromptSuggestions";
import {
  MODE_COPY,
  PROMPT_PLACEHOLDER,
  PROMPT_SUGGESTIONS,
} from "@/lib/generation/prompt";
import { INPAINT_COST_USD } from "@/lib/generation/pricing";
import type { InpaintMode } from "@/lib/generation/types";
import styles from "./GenerationPanel.module.css";

const money = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/**
 * La intensidad recomendada, y las dos que la rodean.
 *
 * No son valores elegidos a ojo. Sobre la misma prenda, la misma máscara y la
 * misma semilla (`EXPERIMENTO_6`): a 0.70 el pedido no llega a mandar y la
 * prenda apenas cambia; a 0.85 cambia la tela y conserva a la persona, la pose,
 * la luz y el fondo; a 1.00 la prenda se pierde, sin mangas y sin manos.
 */
export const DEFAULT_STRENGTH = 0.85;
const STRENGTH_MIN = 0.5;
const STRENGTH_MAX = 1;
/**
 * De a 0.01, no de a 0.05. El margen útil es angosto (0.70 no alcanza, 1.00
 * destruye la prenda) y en el uso real pasar de 0.85 a 0.90 ya cambia mucho el
 * resultado, así que el paso de 0.05 saltaba justo por encima de los valores
 * que hacía falta probar. Dos decimales es también lo que guarda la columna
 * `generation_strength`, `numeric(3,2)`.
 */
const STRENGTH_STEP = 0.01;

interface GenerationPanelProps {
  mode: InpaintMode;
  onModeChange: (mode: InpaintMode) => void;
  /** Solo se usa en `draw`; en `fill` el modelo no lee el parámetro. */
  strength: number;
  onStrengthChange: (strength: number) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  onGenerate: () => void;
  hasMask: boolean;
  isGenerating: boolean;
  /** True while the provider is the simulator: no call leaves, nothing is charged. */
  isSimulated: boolean;
  disabled?: boolean;
}

/**
 * La mitad generativa del Módulo 2, y ahora son dos modelos, no tres nombres.
 *
 * **Acá había tres pestañas —Limpiar, Forma, Textura— que armaban exactamente
 * el mismo pedido.** Solo cambiaba el texto sugerido, así que "Textura" nunca
 * cambió una textura: el usuario elegía entre tres cosas que eran una sola. El
 * experimento 6 midió dónde cae la diferencia real y son dos caminos, cada uno
 * con su modelo:
 *
 *   * **Completar la zona** (FLUX Fill) rellena con lo que rodea o con lo que
 *     se haya pintado debajo. Quita un logotipo, y convierte en paño una
 *     mancha de color. No obedece órdenes.
 *   * **Dibujar algo nuevo** (FLUX dev con máscara) dibuja lo que se le pide
 *     sin que haya que pintar nada.
 *
 * **La "Intensidad" vuelve, y la historia de por qué importa.** Este panel
 * tuvo un control de intensidad, y quitarlo fue correcto: movía `strength`,
 * que FLUX Fill no lee —lo dice su documentación y lo confirmó la factura, con
 * un pedido a 0.45 costando el 46% de uno a 0.85— así que recortaba el cómputo
 * mientras la etiqueta prometía otra cosa. Vuelve porque **el otro modelo sí
 * la usa**, y ahí manda: es la diferencia entre un cambio que no se ve y una
 * prenda destruida. Por eso aparece solo en "Dibujar", que es donde el número
 * hace algo.
 *
 * **El costo va antes de gastar.** Durante una llamada un vendedor prueba
 * cinco cosas mientras cotiza, y un precio que solo aparece en el historial es
 * un precio del que se entera tarde.
 */
export function GenerationPanel({
  mode,
  onModeChange,
  strength,
  onStrengthChange,
  description,
  onDescriptionChange,
  onGenerate,
  hasMask,
  isGenerating,
  isSimulated,
  disabled = false,
}: GenerationPanelProps) {
  const promptId = useId();
  const strengthId = useId();
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const canGenerate =
    !disabled && !isGenerating && hasMask && description.trim().length >= 3;

  return (
    <div className={styles.panel}>
      <PillTabs
        label="Qué hacer con la zona"
        selected={mode}
        onSelect={(key) => onModeChange(key as InpaintMode)}
        // Completar primero: es el camino con más evidencia detrás y el que
        // resuelve el caso más frecuente, que es quitar algo de la prenda.
        options={[
          { key: "fill", label: MODE_COPY.fill.label },
          { key: "draw", label: MODE_COPY.draw.label },
        ]}
      />

      <div className={styles.field}>
        <div className={styles.fieldHead}>
          <label className={styles.label} htmlFor={promptId}>
            {mode === "fill" ? "Qué debe quedar en esa zona" : "Qué quieres ahí"}
          </label>
          {/* Al lado de la caja y no escondido en un menú: la redacción es la
              palanca más grande sobre el resultado, y los ejemplos son como
              alguien aprende cuán largo y cuán específico conviene ser. */}
          <button
            type="button"
            className={styles.suggest}
            onClick={() => setSuggestionsOpen(true)}
            disabled={disabled || isGenerating}
          >
            Sugerencias
          </button>
        </div>
        <textarea
          id={promptId}
          className={styles.prompt}
          rows={3}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder={PROMPT_PLACEHOLDER[mode]}
          disabled={disabled || isGenerating}
        />
      </div>

      {/* Solo en el modo que la usa. En el otro sería un control que el modelo
          ignora, que es exactamente lo que este panel ya tuvo una vez. */}
      {mode === "draw" && (
        <div className={styles.field}>
          <div className={styles.fieldHead}>
            <label className={styles.label} htmlFor={strengthId}>
              Intensidad
            </label>
            <output className={styles.strengthValue} htmlFor={strengthId}>
              {strength.toFixed(2)}
            </output>
          </div>
          <input
            id={strengthId}
            className={styles.strength}
            type="range"
            min={STRENGTH_MIN}
            max={STRENGTH_MAX}
            step={STRENGTH_STEP}
            value={strength}
            onChange={(event) => onStrengthChange(Number(event.target.value))}
            disabled={disabled || isGenerating}
          />
          <p className={styles.note}>
            <strong>0.85</strong> es el valor que funcionó en las pruebas. Más
            abajo cambia poco; más arriba puede perder la prenda.
          </p>
        </div>
      )}

      {/* Qué hace este modo, en el panel y no solo en el diálogo de
          sugerencias: es la diferencia entre dos pestañas y dos pestañas entre
          las que alguien puede elegir. */}
      <p className={styles.note}>{MODE_COPY[mode].hint}</p>

      <PromptSuggestions
        title={`Sugerencias para ${MODE_COPY[mode].label.toLowerCase()}`}
        hint={MODE_COPY[mode].hint}
        examples={PROMPT_SUGGESTIONS[mode]}
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        onUse={onDescriptionChange}
      />

      {/* Visible, no un tooltip sobre el botón apagado: un control
          deshabilitado no dispara hover de forma confiable y nunca lo hace en
          táctil, así que la única explicación de un botón muerto era una que
          mucha gente no podía alcanzar. */}
      {!hasMask && (
        <p className={styles.blocked} role="status">
          Pinta primero la zona de la prenda que quieres cambiar.
        </p>
      )}

      <Button variant="primary" onClick={onGenerate} disabled={!canGenerate}>
        {isGenerating ? "Generando…" : "Generar"}
      </Button>

      <p className={styles.cost}>
        {isSimulated ? (
          <>
            <span className={styles.simulated}>Simulado</span>. No se llama a
            ningún servicio y no se cobra nada.
          </>
        ) : (
          <>
            Cuesta unos <strong>{money.format(INPAINT_COST_USD)}</strong> por
            generación. El costo real se registra en el diseño.
          </>
        )}
      </p>
    </div>
  );
}
