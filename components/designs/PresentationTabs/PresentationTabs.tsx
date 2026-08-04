"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button/Button";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import styles from "./PresentationTabs.module.css";

type Tab = "plana" | "modelo_guardado" | "modelo_ia";

const TABS: { key: Tab; label: string; description: string }[] = [
  {
    key: "plana",
    label: "Plana",
    description: "El diseño tal como quedó en el lienzo.",
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

interface PresentationTabsProps {
  designName: string;
  /** The base garment already chosen in edición — real data, no mock. */
  flatImageUrl: string | null;
  projectId: string;
}

/**
 * Presentación scaffold: "Plana" shows the same image already picked in
 * edición (real data, just a pass-through). "Modelo guardado"/"Modelo IA"
 * need actual generation (Runware, Módulo 3) — out of scope here, so they
 * show a clearly-labeled placeholder instead of faking a result.
 */
export function PresentationTabs({
  designName,
  flatImageUrl,
  projectId,
}: PresentationTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("plana");
  const current = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

  return (
    <>
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

      <div className={styles.stage}>
        {activeTab === "plana" ? (
          flatImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply
            <img
              className={styles.stageImage}
              src={flatImageUrl}
              alt={designName}
            />
          ) : (
            <p className={styles.stageEmpty}>Sin prenda base todavía.</p>
          )
        ) : (
          <div className={styles.stageMock}>
            <p className={styles.stageMockTitle}>Próximamente</p>
            <p className={styles.stageMockHint}>
              {activeTab === "modelo_guardado"
                ? "Elegir un modelo del catálogo del cliente y generar la composición."
                : "Generar un modelo humano con IA a partir de un prompt."}
            </p>
          </div>
        )}
      </div>

      <p className={styles.description}>{current.description}</p>

      <div className={styles.actions}>
        <Link
          className={`${buttonStyles.base} ${buttonStyles.secondary} ${styles.backLink}`}
          href={`/projects/${projectId}`}
        >
          Volver al proyecto
        </Link>
        <Button
          variant="primary"
          disabled
          title="Próximamente: exportar y confirmar el diseño final."
        >
          Confirmar diseño
        </Button>
      </div>
    </>
  );
}
