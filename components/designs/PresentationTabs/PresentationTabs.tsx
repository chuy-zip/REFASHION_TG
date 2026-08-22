"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import type { AssetWithUrl } from "@/lib/assets";
import styles from "./PresentationTabs.module.css";

type Tab = "plana" | "modelo_guardado" | "modelo_ia";

const TABS: { key: Tab; label: string; description: string }[] = [
  {
    key: "plana",
    label: "Plana",
    description: "La prenda con sus logotipos aplicados.",
  },
  {
    key: "modelo_guardado",
    label: "Modelo guardado",
    description:
      "Colocado sobre una foto de modelo del catálogo del cliente.",
  },
  {
    key: "modelo_ia",
    label: "Modelo IA",
    description: "Colocado sobre un modelo humano generado por IA.",
  },
];

const dateFormat = new Intl.DateTimeFormat("es-GT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

interface PresentationTabsProps {
  designName: string;
  /**
   * The design's compositions, oldest first. These are what "Plana" shows:
   * the garment **with its logos**, which is what the client is buying.
   */
  compositions: AssetWithUrl[];
  /** Fallback while the design has no composition yet: the clean garment. */
  workingImageUrl: string | null;
}

/**
 * Presentación: "Plana" shows a composition (objetivo específico 3a).
 * "Modelo guardado" / "Modelo IA" need actual generation (Runware, Módulo 3),
 * so they show a clearly-labeled placeholder instead of faking a result.
 *
 * It used to show the *working image*, which is the clean garment — presenting
 * a uniform without its logo, exactly what nobody wants to see. The working
 * image stays as the fallback for a design that has not composed anything yet.
 */
export function PresentationTabs({
  designName,
  compositions,
  workingImageUrl,
}: PresentationTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("plana");

  // The newest is the default because it is usually the latest agreement, but
  // any of them can be presented: during a call three get tried and the client
  // picks the second.
  const [selectedId, setSelectedId] = useState<string | null>(
    compositions.at(-1)?.id ?? null
  );

  const current = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];
  const selected =
    compositions.find((asset) => asset.id === selectedId) ??
    compositions.at(-1) ??
    null;

  const flatUrl = selected?.url ?? workingImageUrl;
  const isShowingImage = activeTab === "plana" && flatUrl !== null;

  return (
    <>
      {/* The action rides in the tab strip because it acts on what the strip
          is showing, and because it depends on which composition is selected —
          state that lives here and not in the page's title row. */}
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Presentación">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={styles.tab}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {selected ? (
          <a
            className={`${buttonStyles.base} ${buttonStyles.primary}`}
            href={selected.downloadUrl}
            download
          >
            Descargar
          </a>
        ) : (
          <Button
            variant="primary"
            disabled
            title="Crea una composición en la pantalla de edición para poder descargarla."
          >
            Descargar
          </Button>
        )}
      </div>

      {/* Image surface when there is something to show, and nothing at all
          when there is not: the dashed box of the empty state is the only
          frame then, so two frames never stack. The height is kept in both
          cases so switching tabs does not move the page. */}
      <div
        className={`${styles.stage} ${
          isShowingImage ? styles.stageWithImage : ""
        }`}
      >
        {isShowingImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply
          <img className={styles.stageImage} src={flatUrl!} alt={designName} />
        ) : activeTab === "plana" ? (
          <EmptyState
            size="sm"
            title="Sin prenda base todavía"
            hint="Elige una en la pantalla de edición para poder presentar el diseño."
          />
        ) : (
          <EmptyState
            size="sm"
            title="Próximamente"
            hint={
              activeTab === "modelo_guardado"
                ? "Elegir un modelo del catálogo del cliente y generar la composición."
                : "Generar un modelo humano con IA a partir de un prompt."
            }
          />
        )}
      </div>

      {/* Same chronological order as the history on the design's page, so the
          same three compositions read the same way in both screens. */}
      {activeTab === "plana" && compositions.length > 1 && (
        <div className={styles.picker}>
          <span className={styles.pickerLabel}>Composición</span>
          <div className={styles.pickerRow}>
            {compositions.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className={styles.pickerItem}
                aria-pressed={selected?.id === asset.id}
                onClick={() => setSelectedId(asset.id)}
                title={dateFormat.format(new Date(asset.created_at))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
                <img
                  className={styles.pickerThumb}
                  src={asset.url}
                  alt={`Composición del ${dateFormat.format(
                    new Date(asset.created_at)
                  )}`}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <p className={styles.description}>
        {activeTab === "plana" && compositions.length === 0
          ? "Este diseño todavía no tiene composiciones. Se muestra la prenda sin logotipos."
          : current.description}
      </p>

    </>
  );
}
