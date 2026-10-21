"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TryOnPanel } from "@/components/designs/TryOnPanel/TryOnPanel";
import { GarmentChoice } from "@/components/designs/GarmentChoice/GarmentChoice";
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
  /** The clean garment: the fallback, and also a deliberate choice. */
  workingImageUrl: string | null;
  workingImageDownloadUrl: string | null;
  /**
   * When the clean garment last changed.
   *
   * Only used to tell whether a composition has fallen behind it. A
   * composition is a flattened snapshot, so an edit made after it was created
   * is not in it, and nothing said so.
   */
  workingImageCreatedAt: string | null;
  /** The same fallback as an id, which is what a generation request carries. */
  workingImageAssetId: string | null;
  designId: string;
  /** Where a try-on result gets filed, so the panel can link to it. */
  clientId: string;
  /**
   * Why this design cannot be tried on, or null when it can.
   *
   * Resolved by the page from what the design STARTED from, not from what it is
   * working on now: once the canvas came out of a model photo, everything
   * derived from it still has a person in it.
   */
  tryOnBlockedReason: string | null;
  /** Owner, editor or admin on this client. Read-only members get the reason. */
  canEdit: boolean;
  /** True while the provider is the simulator. */
  isSimulated: boolean;
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
  workingImageDownloadUrl,
  workingImageCreatedAt,
  workingImageAssetId,
  designId,
  clientId,
  tryOnBlockedReason,
  canEdit,
  isSimulated,
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

  /**
   * Si ya se contestó la pregunta de qué prenda se prueba.
   *
   * Se pregunta una vez por visita y no por pestaña: cambiar entre Modelo
   * guardado y Modelo IA no es volver a decidir nada.
   */
  const [garmentConfirmed, setGarmentConfirmed] = useState(false);

  const current = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

  /**
   * **`null` significa la prenda limpia, elegida a propósito.**
   *
   * Antes caía a la composición más reciente cuando no encontraba la
   * seleccionada, y eso convertía la regla en una condena: una vez que un
   * diseño tenía una composición, no había forma de presentar la prenda sin
   * logotipos salvo borrarla. Alguien que compone y después decide que el
   * uniforme va liso no debería tener que destruir su trabajo para mostrarlo.
   *
   * El valor inicial sigue siendo la composición más reciente, porque es lo
   * que el cliente está comprando casi siempre. Lo que cambia es que ahora hay
   * a dónde volver.
   */
  const selected =
    compositions.find((asset) => asset.id === selectedId) ?? null;

  /**
   * Una composición es un aplanado, así que un cambio en la prenda hecho
   * después no está adentro. Comparar las dos fechas es todo lo que hace falta
   * para decirlo, y decirlo es la diferencia entre presentar algo viejo y
   * saber que se está presentando algo viejo.
   */
  const latestComposition = compositions.at(-1) ?? null;

  const outdated =
    selected !== null &&
    workingImageCreatedAt !== null &&
    new Date(workingImageCreatedAt) > new Date(selected.created_at);

  const flatUrl = selected?.url ?? workingImageUrl;
  // The id of that same image. Resolved together with the URL and never apart,
  // so the picture on screen and the picture in the request are the same one.
  const flatAssetId = selected?.id ?? workingImageAssetId;
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

        {/* **Solo en Plana**, porque solo ahí descarga lo que estás viendo.
            En las dos pestañas de modelo seguía ofreciendo la composición
            plana, que no es lo que hay en pantalla: un botón que se lleva otra
            cosa distinta de la que mira el usuario. El resultado de una prueba
            virtual tiene su propia descarga donde queda archivado, en los
            productos finales del cliente. */}
        {activeTab === "plana" &&
          (() => {
            // Lo que se descarga es lo que se está viendo, composición o
            // prenda limpia. Antes solo existía la primera, así que elegir
            // "sin logotipos" habría dejado el botón muerto sin motivo.
            const href = selected?.downloadUrl ?? workingImageDownloadUrl;
            return href ? (
              <a
                className={`${buttonStyles.base} ${buttonStyles.primary}`}
                href={href}
                download
              >
                Descargar
              </a>
            ) : (
              <Button
                variant="primary"
                disabled
                title="Elige una prenda base en la pantalla de edición para poder descargarla."
              >
                Descargar
              </Button>
            );
          })()}
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
        ) : compositions.length > 0 && !garmentConfirmed && flatUrl ? (
          /* **El paso previo**, y solo cuando hay algo que decidir. Sin
             composiciones la respuesta es única y preguntarla sería ceremonia.

             La pregunta se hace acá y no repitiendo el selector en las tres
             pestañas: el mismo control tres veces se lee como tres ajustes
             distintos. */
          <GarmentChoice
            workingImageUrl={workingImageUrl ?? flatUrl}
            composition={latestComposition}
            outdated={outdated}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onContinue={() => setGarmentConfirmed(true)}
          />
        ) : (
          /* Handed the SAME garment the "Plana" tab resolved, so the three
             tabs can never disagree about which image this design is. When
             there is no composition that is the clean garment, which is the
             right answer rather than a fallback: a design with no logo layers
             still has something to try on. */
          <TryOnPanel
            /**
             * Una instancia por pestaña, y esto no es cosmético.
             *
             * Las dos pestañas de modelo montan este mismo componente en la
             * misma posición, así que sin `key` React reusa la instancia y el
             * estado interno sobrevive al cambio: el modelo elegido, el que se
             * acaba de generar y, sobre todo, el resultado. Y como el panel
             * muestra el resultado apenas lo tiene, pasar de "Foto del cliente"
             * a "Modelo IA" después de una prueba seguía mostrando la prueba
             * anterior. Iba a "Plana" y volvía, y ahí sí andaba: eso era el
             * desmontaje haciendo lo que este `key` hace ahora.
             *
             * Empezar limpio es además lo correcto: lo elegido pertenece a la
             * pestaña donde se eligió, y el resultado no se pierde, queda
             * guardado en los productos finales del cliente.
             */
            key={activeTab}
            source={activeTab === "modelo_guardado" ? "saved" : "ai"}
            designId={designId}
            clientId={clientId}
            models={models}
            garmentUrl={flatUrl}
            garmentAssetId={flatAssetId}
            hasLogos={selected !== null}
            blockedReason={tryOnBlockedReason}
            canEdit={canEdit}
            isSimulated={isSimulated}
          />
        )}
      </div>

      {/* Same chronological order as the history on the design's page, so the
          same three compositions read the same way in both screens. */}
      {activeTab === "plana" && compositions.length > 0 && (
        <div className={styles.picker}>
          <span className={styles.pickerLabel}>Qué se presenta</span>
          <div className={styles.pickerRow}>
            {/* La prenda limpia, primera y siempre disponible. Es la salida que
                no existía: sin esto, componer una vez era una decisión
                irreversible salvo borrando. */}
            {workingImageUrl && (
              <button
                type="button"
                className={styles.pickerItem}
                aria-pressed={selected === null}
                onClick={() => setSelectedId(null)}
                title="La prenda sin logotipos"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL */}
                <img
                  className={styles.pickerThumb}
                  src={workingImageUrl}
                  crossOrigin="anonymous"
                  alt="La prenda sin logotipos"
                />
              </button>
            )}
            {/* **Solo la última composición, no todas.**
                Listarlas todas hacía crecer la tira sin techo: cada "Crear
                composición" dejaba una miniatura para siempre, y las de hace
                tres semanas no son candidatas a presentar hoy. El registro
                completo vive en la tira de Resultados del hub; acá van las dos
                candidatas reales, la prenda y lo último que se compuso. */}
            {latestComposition && (
              <button
                type="button"
                className={styles.pickerItem}
                aria-pressed={selected?.id === latestComposition.id}
                onClick={() => setSelectedId(latestComposition.id)}
                title={dateFormat.format(
                  new Date(latestComposition.created_at)
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
                <img
                  className={styles.pickerThumb}
                  src={latestComposition.url}
                  crossOrigin="anonymous"
                  alt={`Composición del ${dateFormat.format(
                    new Date(latestComposition.created_at)
                  )}`}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {outdated && (
        <p className={styles.outdated}>
          Esta composición es anterior a tu último cambio en la prenda, así que
          no lo incluye. Vuelve a crearla en la pantalla de edición para
          incorporarlo.
        </p>
      )}

      <p className={styles.description}>
        {activeTab === "plana" && compositions.length === 0
          ? "Este diseño todavía no tiene composiciones. Se muestra la prenda sin logotipos."
          : selected === null && activeTab === "plana"
            ? "Se muestra la prenda sin logotipos. Elige una composición arriba para incluirlos."
            : current.description}
      </p>
      </div>
    </>
  );
}
