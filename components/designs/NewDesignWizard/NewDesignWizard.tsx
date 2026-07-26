"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiGet, apiPost } from "@/lib/api-client";
import { GARMENT_TYPE_COPY, type GarmentType } from "@/lib/designs";
import type { Design, Project } from "@/lib/types";
import styles from "./NewDesignWizard.module.css";

const GARMENT_TYPES: GarmentType[] = ["shirt", "polo", "hoodie"];

/** Sentinel value for "no existing project selected — create one instead". */
const NEW_PROJECT = "__new__";

type Step = "client" | "project" | "design";

const STEP_LABEL: Record<Step, string> = {
  client: "Paso 1 de 3 · Cliente",
  project: "Paso 2 de 3 · Proyecto",
  design: "Paso 3 de 3 · Diseño",
};

interface NewDesignWizardProps {
  /** Clients the signed-in user may create projects/designs on. */
  clients: { id: string; name: string }[];
}

/**
 * Sidebar shortcut to create a design without first navigating
 * cliente → proyecto by hand. Walks client → project (existing or new) →
 * design fields, then posts to the same /api/designs the per-project dialog
 * uses, and lands on the project detail page (no design detail page yet).
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

  const [name, setName] = useState("");
  const [garmentType, setGarmentType] = useState<GarmentType>("shirt");
  const [version, setVersion] = useState(1);
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function open() {
    setStep("client");
    setClientId(clients[0]?.id ?? "");
    setProjects(null);
    setProjectId(NEW_PROJECT);
    setNewProjectName("");
    setResolvedProjectId(null);
    setName("");
    setGarmentType("shirt");
    setVersion(1);
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

    const result = await apiGet<Project[]>(
      `/api/projects?client_id=${clientId}`
    );

    setIsLoadingProjects(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setProjects(result.data);
    setProjectId(result.data[0]?.id ?? NEW_PROJECT);
    setStep("project");
  }

  async function handleProjectNext() {
    setError(null);

    if (projectId === NEW_PROJECT) {
      if (newProjectName.trim().length === 0) {
        setError("El nombre del proyecto es obligatorio.");
        return;
      }

      setIsSubmitting(true);
      const result = await apiPost<Project>("/api/projects", {
        client_id: clientId,
        name: newProjectName,
      });
      setIsSubmitting(false);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setResolvedProjectId(result.data.id);
    } else {
      setResolvedProjectId(projectId);
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
      version,
      notes: notes.trim() || null,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    close();
    notify({ type: "success", message: "Diseño creado." });
    router.push(`/projects/${resolvedProjectId}`);
  }

  const titleId = "new-design-wizard";

  return (
    <>
      <Button
        variant="primary"
        className={styles.trigger}
        onClick={open}
      >
        + Nuevo diseño
      </Button>

      <Dialog open={isOpen} onClose={close} labelledBy={titleId}>
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

            <div className={styles.field}>
              <label
                className={styles.label}
                htmlFor={`${titleId}-base-garment`}
              >
                Prenda base <span className={styles.optional}>(opcional)</span>
              </label>
              <Button
                id={`${titleId}-base-garment`}
                variant="ghost"
                disabled
                title="Próximamente: elegir una prenda del catálogo del cliente como punto de partida."
              >
                Elegir del catálogo — próximamente
              </Button>
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
                  type="number"
                  min={1}
                  step={1}
                  value={version}
                  onChange={(event) =>
                    setVersion(Math.max(1, Number(event.target.value) || 1))
                  }
                  disabled={isSubmitting}
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
                onClick={() => setStep("project")}
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
