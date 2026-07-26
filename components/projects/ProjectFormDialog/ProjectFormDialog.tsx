"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPatch, apiPost } from "@/lib/api-client";
import { PROJECT_STATUS_COPY } from "@/lib/projects";
import type { Project, ProjectStatus } from "@/lib/types";
import styles from "./ProjectFormDialog.module.css";

const STATUSES: ProjectStatus[] = ["draft", "active", "closed"];

interface ProjectFormDialogProps {
  /** Parent client; required to create. */
  clientId: string;
  /** Present => edit that project (PATCH). Absent => create (POST). */
  project?: Project;
  triggerLabel?: string;
  triggerVariant?: ButtonVariant;
  disabled?: boolean;
  disabledReason?: string;
  /** Controlled mode: parent drives visibility and renders no trigger. */
  open?: boolean;
  onClose?: () => void;
}

export function ProjectFormDialog({
  clientId,
  project,
  triggerLabel,
  triggerVariant = "primary",
  disabled = false,
  disabledReason,
  open: controlledOpen,
  onClose,
}: ProjectFormDialogProps) {
  const router = useRouter();
  const { notify } = useToast();
  const isEdit = project !== undefined;
  const isControlled = controlledOpen !== undefined;

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(
    project?.status ?? "draft"
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function close() {
    if (isControlled) onClose?.();
    else setInternalOpen(false);
  }

  function open() {
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setStatus(project?.status ?? "draft");
    setError(null);
    setInternalOpen(true);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = isEdit
      ? await apiPatch(`/api/projects/${project.id}`, {
          name,
          description: description.trim() || null,
          status,
        })
      : await apiPost("/api/projects", {
          client_id: clientId,
          name,
          description: description.trim() || null,
          status,
        });

    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    close();
    notify({
      type: "success",
      message: isEdit ? "Proyecto actualizado." : "Proyecto creado.",
    });
    router.refresh();
  }

  const titleId = isEdit ? `edit-project-${project.id}` : "create-project";

  return (
    <>
      {!isControlled && (
        <Button
          variant={triggerVariant}
          onClick={open}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          {triggerLabel}
        </Button>
      )}

      <Dialog open={isOpen} onClose={close} labelledBy={titleId}>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h2 className={styles.title} id={titleId}>
            {isEdit ? "Editar proyecto" : "Nuevo proyecto"}
          </h2>

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
            <label className={styles.label} htmlFor={`${titleId}-status`}>
              Estado
            </label>
            <select
              id={`${titleId}-status`}
              className={styles.input}
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ProjectStatus)
              }
              disabled={isSubmitting}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_COPY[s].label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${titleId}-description`}>
              Descripción <span className={styles.optional}>(opcional)</span>
            </label>
            <textarea
              id={`${titleId}-description`}
              className={styles.textarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={close}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || name.trim().length === 0}
            >
              {isSubmitting ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
