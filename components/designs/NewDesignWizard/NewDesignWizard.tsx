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
  toDesignOptions,
  type DesignOption,
  type GarmentType,
} from "@/lib/designs";
import type { AssetWithUrl } from "@/lib/assets";
import type { Design, Project } from "@/lib/types";
import styles from "./NewDesignWizard.module.css";

const GARMENT_TYPES: GarmentType[] = ["shirt", "polo", "hoodie"];

/** Sentinel value for "no existing project selected — create one instead". */
const NEW_PROJECT = "__new__";

type Step = "client" | "project" | "start" | "design";

const STEP_LABEL: Record<Step, string> = {
  client: "Paso 1 de 4 · Cliente",
  project: "Paso 2 de 4 · Proyecto",
  start: "Paso 3 de 4 · Punto de partida",
  design: "Paso 4 de 4 · Diseño",
};

interface NewDesignWizardProps {
  /** Clients the signed-in user may create projects/designs on. */
  clients: { id: string; name: string }[];
}

/**
 * Sidebar shortcut to create a design without first navigating
 * cliente → proyecto by hand. Walks client → project (existing or new) →
 * starting point → design fields, posts to the same /api/designs the
 * per-project dialog uses, and lands on the design's editing screen.
 */
export function NewDesignWizard({ clients }: NewDesignWizardProps) {
  const router = useRouter();
  const { notify } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("client");

  const [clientId, setClientId] = useState(clients[0]?.id ?? "");

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<string>(NEW_PROJECT);
  const [newProjectName, setNewProjectName] = useState("");
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(
    null
  );

  const [assets, setAssets] = useState<AssetWithUrl[]>([]);
  const [designOptions, setDesignOptions] = useState<DesignOption[]>([]);
  const [startingPoint, setStartingPoint] = useState<StartingPoint | null>(null);

  const [name, setName] = useState("");
  const [garmentType, setGarmentType] = useState<GarmentType>("shirt");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** The parent design, when the starting point is an iteration. */
  const parentDesign =
    startingPoint?.kind === "design"
      ? designOptions.find((option) => option.id === startingPoint.id) ?? null
      : null;

  // Mirrors what the server will derive on insert (see POST /api/designs).
  const nextVersion = parentDesign ? parentDesign.version + 1 : 1;

  function open() {
    setStep("client");
    setClientId(clients[0]?.id ?? "");
    setProjects(null);
    setProjectId(NEW_PROJECT);
    setNewProjectName("");
    setResolvedProjectId(null);
    setAssets([]);
    setDesignOptions([]);
    setStartingPoint(null);
    setName("");
    setGarmentType("shirt");
    setNotes("");
    setError(null);
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
  }

  async function handleClientNext() {
    if (!clientId) return;
    setError(null);
    setIsLoadingProjects(true);

    // Assets are best-effort: the starting point is optional, so a failure
    // there shouldn't block moving on.
    const [projectsResult, assetsResult] = await Promise.all([
      apiGet<Project[]>(`/api/projects?client_id=${clientId}`),
      apiGet<AssetWithUrl[]>(`/api/assets?client_id=${clientId}`),
    ]);

    setIsLoadingProjects(false);

    if (!projectsResult.ok) {
      setError(projectsResult.error);
      return;
    }

    setProjects(projectsResult.data);
    setProjectId(projectsResult.data[0]?.id ?? NEW_PROJECT);
    setAssets(assetsResult.ok ? assetsResult.data : []);
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

    // Existing designs of this project become the iteration candidates. Their
    // previews resolve against the assets already fetched — no second signing.
    const designsResult = await apiGet<Design[]>(
      `/api/designs?project_id=${targetProjectId}`
    );
    setDesignOptions(
      designsResult.ok ? toDesignOptions(designsResult.data, assets) : []
    );

    setIsSubmitting(false);
    setStartingPoint(null);
    setStep("start");
  }

  function handleStartNext() {
    // Iterating carries the parent's identity forward: same name and garment,
    // next version. All three stay editable except the version.
    if (parentDesign) {
      setName(parentDesign.name);
      setGarmentType(parentDesign.garment_type as GarmentType);
    }
    setStep("design");
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

  const titleId = "new-design-wizard";

  return (
    <>
      <Button variant="primary" className={styles.trigger} onClick={open}>
        + Nuevo diseño
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
            <p className={styles.stepLabel}>{STEP_LABEL.client}</p>

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
            <p className={styles.stepLabel}>{STEP_LABEL.project}</p>

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
            <p className={styles.stepLabel}>{STEP_LABEL.start}</p>
            <p className={styles.hint}>
              Elige una imagen del catálogo, o un diseño existente para crear su
              siguiente versión. También puedes continuar sin punto de partida.
            </p>

            <StartingPointPicker
              assets={assets}
              designs={designOptions}
              value={startingPoint}
              onChange={setStartingPoint}
            />

            <div className={`${styles.actions} ${styles.spread}`}>
              <Button variant="secondary" onClick={() => setStep("project")}>
                Atrás
              </Button>
              <Button variant="primary" onClick={handleStartNext}>
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
            <p className={styles.stepLabel}>{STEP_LABEL.design}</p>

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
                Notas <span className={styles.optional}>(opcional)</span>
              </label>
              <textarea
                id={`${titleId}-notes`}
                className={styles.textarea}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                disabled={isSubmitting}
              />
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
