"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import {
  StartingPointPicker,
  type StartingPoint,
} from "@/components/designs/StartingPointPicker/StartingPointPicker";
import { apiGet, apiPost } from "@/lib/api-client";
import {
  GARMENT_TYPE_COPY,
  type DesignWithPreview,
  type GarmentType,
} from "@/lib/designs";
import type { AssetWithUrl } from "@/lib/assets";
import type { Design, Project } from "@/lib/types";
import styles from "./DesignWizard.module.css";

const GARMENT_TYPES: GarmentType[] = ["shirt", "polo", "hoodie"];

/** Sentinel value for "no existing project selected — create one instead". */
const NEW_PROJECT = "__new__";

type Step = "client" | "project" | "start" | "design";

const STEP_TITLE: Record<Step, string> = {
  client: "Cliente",
  project: "Proyecto",
  start: "Punto de partida",
  design: "Diseño",
};

/** Client and project already resolved by where the wizard was opened from. */
export interface DesignWizardContext {
  clientId: string;
  projectId: string;
}

interface DesignWizardProps {
  /**
   * Clients the signed-in user may create projects/designs on. Required for
   * the sidebar entry point, where picking one is the first step. Ignored when
   * `context` is given.
   */
  clients?: { id: string; name: string }[];
  /** Project entry point: skips the client and project steps. */
  context?: DesignWizardContext;
  triggerLabel?: string;
  /** The sidebar's trigger spans the rail; a section header's does not. */
  fullWidthTrigger?: boolean;
}

/**
 * The single path for creating a design, with two entry points:
 *
 * - Sidebar shortcut: client -> project (existing or new) -> starting point ->
 *   design fields, so nobody has to navigate cliente → proyecto by hand.
 * - A project's "Crear diseño": the same wizard with `context`, starting at the
 *   starting point because client and project are already known.
 *
 * Both post to the same /api/designs and land on the design's working screen.
 * There is deliberately no second create form: DesignDataDialog only edits.
 */
export function DesignWizard({
  clients = [],
  context,
  triggerLabel = "+ Nuevo diseño",
  fullWidthTrigger = false,
}: DesignWizardProps) {
  const router = useRouter();
  const { notify } = useToast();

  // With a context there is nothing to ask before the starting point.
  const steps: Step[] = context
    ? ["start", "design"]
    : ["client", "project", "start", "design"];

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>(steps[0]);

  const [clientId, setClientId] = useState(context?.clientId ?? "");

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string>(NEW_PROJECT);
  const [newProjectName, setNewProjectName] = useState("");
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(
    null
  );

  const [assets, setAssets] = useState<AssetWithUrl[]>([]);
  const [designOptions, setDesignOptions] = useState<DesignWithPreview[]>([]);
  const [startingPoint, setStartingPoint] = useState<StartingPoint | null>(null);

  const [name, setName] = useState("");
  const [garmentType, setGarmentType] = useState<GarmentType>("shirt");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingStart, setIsLoadingStart] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** The parent design, when the starting point is an iteration. */
  const parentDesign =
    startingPoint?.kind === "design"
      ? designOptions.find((option) => option.id === startingPoint.id) ?? null
      : null;

  // Mirrors what the server will derive on insert (see POST /api/designs).
  const nextVersion = parentDesign ? parentDesign.version + 1 : 1;

  function stepLabel(current: Step): string {
    const index = steps.indexOf(current);
    return `Paso ${index + 1} de ${steps.length} · ${STEP_TITLE[current]}`;
  }

  /**
   * What the starting-point step shows: the client's catalog and the project's
   * existing designs. Fetched when the step is reached rather than handed down
   * from the server, so the signed thumbnail URLs are always fresh and a page
   * left open overnight does not open a picker full of broken images.
   */
  async function loadStartingPoint(forClient: string, forProject: string) {
    const [assetsResult, designsResult] = await Promise.all([
      apiGet<AssetWithUrl[]>(`/api/assets?client_id=${forClient}`),
      // Previews come resolved from the server: a design is shown by its latest
      // composition, which is the version with the logos the user recognises.
      apiGet<DesignWithPreview[]>(`/api/designs?project_id=${forProject}`),
    ]);

    // Both are best-effort: the starting point is optional, so a failure here
    // must not block creating the design.
    setAssets(assetsResult.ok ? assetsResult.data : []);
    setDesignOptions(designsResult.ok ? designsResult.data : []);
  }

  async function open() {
    setStep(steps[0]);
    setClientId(context?.clientId ?? clients[0]?.id ?? "");
    setProjects(null);
    setProjectId(NEW_PROJECT);
    setNewProjectName("");
    setResolvedProjectId(context?.projectId ?? null);
    setAssets([]);
    setDesignOptions([]);
    setStartingPoint(null);
    setName("");
    setGarmentType("shirt");
    setNotes("");
    setError(null);
    setIsOpen(true);

    if (context) {
      setIsLoadingStart(true);
      await loadStartingPoint(context.clientId, context.projectId);
      setIsLoadingStart(false);
    }
  }

  function close() {
    setIsOpen(false);
  }

  async function handleClientNext() {
    if (!clientId) return;
    setError(null);
    setIsLoadingProjects(true);

    const projectsResult = await apiGet<Project[]>(
      `/api/projects?client_id=${clientId}`
    );

    setIsLoadingProjects(false);

    if (!projectsResult.ok) {
      setError(projectsResult.error);
      return;
    }

    setProjects(projectsResult.data);
    setProjectId(projectsResult.data[0]?.id ?? NEW_PROJECT);
    setStartingPoint(null);
    setStep("project");
  }

  async function handleProjectNext() {
    setError(null);
    setIsSubmitting(true);

    let targetProjectId = projectId;

    if (projectId === NEW_PROJECT) {
      if (newProjectName.trim().length === 0) {
        setIsSubmitting(false);
        setError("El nombre del proyecto es obligatorio.");
        return;
      }

      const result = await apiPost<Project>("/api/projects", {
        client_id: clientId,
        name: newProjectName,
      });

      if (!result.ok) {
        setIsSubmitting(false);
        setError(result.error);
        return;
      }

      targetProjectId = result.data.id;
    }

    setResolvedProjectId(targetProjectId);
    await loadStartingPoint(clientId, targetProjectId);

    setIsSubmitting(false);
    setStartingPoint(null);
    setStep("start");
  }

  function handleStartNext() {
    // Iterating carries the parent's identity forward: same name and garment,
    // next version. All three stay editable except the version.
    //
    // The name is NOT made unique on purpose. A design is the garment being
    // prototyped, and the version is what separates its iterations: "Camisa
    // polo azul · v2" is the same product, changed. What was missing is not a
    // different name but a record of *what* changed, which is why the notes
    // field asks for it below.
    if (parentDesign) {
      setName(parentDesign.name);
      setGarmentType(parentDesign.garment_type as GarmentType);
    }
    setStep("design");
  }

  /** A newly uploaded catalog image joins the list and becomes the selection. */
  function handleAssetUploaded(asset: AssetWithUrl) {
    setAssets((current) => [asset, ...current]);
    setStartingPoint({ kind: "asset", id: asset.id });
  }

  async function handleCreateDesign(event: SyntheticEvent) {
    event.preventDefault();
    if (!resolvedProjectId) return;

    setError(null);
    setIsSubmitting(true);

    const result = await apiPost<Design>("/api/designs", {
      project_id: resolvedProjectId,
      name,
      garment_type: garmentType,
      base_asset_id:
        startingPoint?.kind === "asset" ? startingPoint.id : null,
      parent_design_id:
        startingPoint?.kind === "design" ? startingPoint.id : null,
      notes: notes.trim() || null,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    close();
    notify({ type: "success", message: "Diseño creado." });
    router.push(`/designs/${result.data.id}/edit`);
  }

  const titleId = "design-wizard";

  return (
    <>
      <Button
        variant="primary"
        className={fullWidthTrigger ? styles.triggerFullWidth : undefined}
        onClick={open}
      >
        {triggerLabel}
      </Button>

      <Dialog
        open={isOpen}
        onClose={close}
        labelledBy={titleId}
        className={step === "start" ? styles.dialogWide : undefined}
      >
        {step === "client" && (
          <div className={styles.form}>
            <h2 className={styles.title} id={titleId}>
              Nuevo diseño
            </h2>
            <p className={styles.stepLabel}>{stepLabel("client")}</p>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${titleId}-client`}>
                Cliente
              </label>
              <select
                id={`${titleId}-client`}
                className={styles.input}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                autoFocus
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.actions}>
              <Button variant="secondary" onClick={close}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleClientNext}
                disabled={isLoadingProjects || !clientId}
              >
                {isLoadingProjects ? "Cargando…" : "Siguiente"}
              </Button>
            </div>
          </div>
        )}

        {step === "project" && (
          <div className={styles.form}>
            <h2 className={styles.title} id={titleId}>
              Nuevo diseño
            </h2>
            <p className={styles.stepLabel}>{stepLabel("project")}</p>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${titleId}-project`}>
                Proyecto
              </label>
              <select
                id={`${titleId}-project`}
                className={styles.input}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                autoFocus
                disabled={isSubmitting}
              >
                {(projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
                <option value={NEW_PROJECT}>+ Crear proyecto nuevo</option>
              </select>
            </div>

            {projectId === NEW_PROJECT && (
              <div className={styles.field}>
                <label
                  className={styles.label}
                  htmlFor={`${titleId}-new-project-name`}
                >
                  Nombre del proyecto nuevo
                </label>
                <input
                  id={`${titleId}-new-project-name`}
                  className={styles.input}
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            )}

            <div className={`${styles.actions} ${styles.spread}`}>
              <Button
                variant="secondary"
                onClick={() => setStep("client")}
                disabled={isSubmitting}
              >
                Atrás
              </Button>
              <Button
                variant="primary"
                onClick={handleProjectNext}
                disabled={
                  isSubmitting ||
                  (projectId === NEW_PROJECT && newProjectName.trim() === "")
                }
              >
                {isSubmitting ? "Guardando…" : "Siguiente"}
              </Button>
            </div>
          </div>
        )}

        {step === "start" && (
          <div className={styles.form}>
            <h2 className={styles.title} id={titleId}>
              Nuevo diseño
            </h2>
            <p className={styles.stepLabel}>{stepLabel("start")}</p>
            <p className={styles.hint}>
              Elige una imagen del catálogo, sube una nueva, o parte de un
              diseño existente para crear su siguiente versión. También puedes
              continuar sin punto de partida.
            </p>

            {isLoadingStart ? (
              <div className={styles.loading}>Cargando el catálogo…</div>
            ) : (
              <StartingPointPicker
                clientId={clientId}
                assets={assets}
                designs={designOptions}
                value={startingPoint}
                onChange={setStartingPoint}
                onAssetUploaded={handleAssetUploaded}
              />
            )}

            <div className={`${styles.actions} ${styles.spread}`}>
              <Button
                variant="secondary"
                onClick={context ? close : () => setStep("project")}
              >
                {context ? "Cancelar" : "Atrás"}
              </Button>
              <Button
                variant="primary"
                onClick={handleStartNext}
                disabled={isLoadingStart}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}

        {step === "design" && (
          <form
            className={styles.form}
            onSubmit={handleCreateDesign}
            noValidate
          >
            <h2 className={styles.title} id={titleId}>
              Nuevo diseño
            </h2>
            <p className={styles.stepLabel}>{stepLabel("design")}</p>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            {parentDesign && (
              <p className={styles.hint}>
                Iteración de <strong>{parentDesign.name}</strong> v
                {parentDesign.version}.
              </p>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${titleId}-name`}>
                Nombre
              </label>
              <input
                id={`${titleId}-name`}
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                required
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${titleId}-garment`}>
                  Tipo de prenda
                </label>
                <select
                  id={`${titleId}-garment`}
                  className={styles.input}
                  value={garmentType}
                  onChange={(event) =>
                    setGarmentType(event.target.value as GarmentType)
                  }
                  disabled={isSubmitting}
                >
                  {GARMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {GARMENT_TYPE_COPY[type].label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${titleId}-version`}>
                  Versión
                </label>
                <input
                  id={`${titleId}-version`}
                  className={styles.input}
                  value={nextVersion}
                  readOnly
                  disabled
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${titleId}-notes`}>
                {parentDesign ? "Qué cambia en esta versión" : "Notas"}{" "}
                <span className={styles.optional}>(opcional)</span>
              </label>
              <textarea
                id={`${titleId}-notes`}
                className={styles.textarea}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                disabled={isSubmitting}
                placeholder={
                  parentDesign ? "Manga corta, el color se mantiene" : undefined
                }
              />
              {parentDesign && (
                <p className={styles.hint}>
                  Las dos versiones van a llamarse igual. Esto es lo que las
                  distingue en la lista.
                </p>
              )}
            </div>

            <div className={`${styles.actions} ${styles.spread}`}>
              <Button
                variant="secondary"
                onClick={() => setStep("start")}
                disabled={isSubmitting}
              >
                Atrás
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || name.trim().length === 0}
              >
                {isSubmitting ? "Creando…" : "Crear diseño"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
