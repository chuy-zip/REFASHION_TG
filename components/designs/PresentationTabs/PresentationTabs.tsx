"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TryOnPanel } from "@/components/designs/TryOnPanel/TryOnPanel";
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
  /**
   * The client's model photos, for the try-on tabs.
   *
   * Read once by the page and handed down rather than fetched per tab: they do
   * not change while this screen is open, and the two tabs that use them would
   * otherwise ask the same question twice.
   */
  models: AssetWithUrl[];
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
  models,
}: PresentationTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("plana");

  // Unlike the catalog's filter strip, these really are tabs: three mutually
  // exclusive views of the same design, only one rendered at a time. So the fix
  // here is the opposite one — complete the pattern instead of dropping it.
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const tabId = (key: Tab) => `${baseId}-tab-${key}`;
  const tablistRef = useRef<HTMLDivElement>(null);

  /**
   * Arrow keys walk the strip and wrap; Home/End jump to the ends. Selection
   * follows focus, which is the right call for three tabs that cost nothing to
   * show: the user hears the panel they landed on without a second keystroke.
   */
  function handleTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.key === activeTab);

    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
        ? (index - 1 + TABS.length) % TABS.length
        : event.key === "Home"
        ? 0
        : event.key === "End"
        ? TABS.length - 1
        : -1;

    if (next === -1) return;
    event.preventDefault();
    setActiveTab(TABS[next].key);
    tablistRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  }

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
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Presentación"
          ref={tablistRef}
          onKeyDown={handleTabKeys}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={tabId(tab.key)}
              aria-selected={activeTab === tab.key}
              aria-controls={panelId}
              // Roving tabindex: the strip is ONE stop in the tab order, and the
              // arrows move within it. Three separate stops would make Tab walk
              // past views the user is not choosing between right now.
              tabIndex={activeTab === tab.key ? 0 : -1}
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

      {/* The panel the strip above points at. One node, relabelled per tab,
          because only one view is ever in the DOM — three panels with two of
          them hidden would be furniture. It carries no styles of its own: the
          blocks inside keep their own margins and the page keeps its rhythm.

          tabIndex 0 because two of the three panels hold nothing focusable
          ("Próximamente" is a paragraph), and a panel a keyboard cannot reach
          is a panel whose content never gets read. */}
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(activeTab)}
        tabIndex={0}
      >
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
          <img className={styles.stageImage} src={flatUrl!} alt={designName} crossOrigin="anonymous" />
        ) : activeTab === "plana" ? (
          <EmptyState
            size="sm"
            title="Sin prenda base todavía"
            hint="Elige una en la pantalla de edición para poder presentar el diseño."
          />
        ) : (
          /* Handed the SAME garment the "Plana" tab resolved, so the three
             tabs can never disagree about which image this design is. When
             there is no composition that is the clean garment, which is the
             right answer rather than a fallback: a design with no logo layers
             still has something to try on. */
          <TryOnPanel
            source={activeTab === "modelo_guardado" ? "saved" : "ai"}
            models={models}
            garmentUrl={flatUrl}
            hasLogos={selected !== null}
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
                  crossOrigin="anonymous"
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
      </div>
    </>
  );
}
