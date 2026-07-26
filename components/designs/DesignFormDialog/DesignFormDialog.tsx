"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPatch, apiPost } from "@/lib/api-client";
import { GARMENT_TYPE_COPY, type GarmentType } from "@/lib/designs";
import type { Design } from "@/lib/types";
import styles from "./DesignFormDialog.module.css";

const GARMENT_TYPES: GarmentType[] = ["shirt", "polo", "hoodie"];

interface DesignFormDialogProps {
  /** Parent project; required to create. */
  projectId: string;
  /** Present => edit that design (PATCH). Absent => create (POST). */
  design?: Design;
  triggerLabel?: string;
  triggerVariant?: ButtonVariant;
  disabled?: boolean;
  disabledReason?: string;
  /** Controlled mode: parent drives visibility and renders no trigger. */
  open?: boolean;
  onClose?: () => void;
}

export function DesignFormDialog({
  projectId,
  design,
  triggerLabel,
  triggerVariant = "primary",
  disabled = false,
  disabledReason,
  open: controlledOpen,
  onClose,
}: DesignFormDialogProps) {
  const router = useRouter();
  const { notify } = useToast();
  const isEdit = design !== undefined;
  const isControlled = controlledOpen !== undefined;

  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const [name, setName] = useState(design?.name ?? "");
  const [garmentType, setGarmentType] = useState<GarmentType>(
    (design?.garment_type as GarmentType) ?? "shirt"
  );
  const [version, setVersion] = useState(design?.version ?? 1);
  const [notes, setNotes] = useState(design?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function close() {
    if (isControlled) onClose?.();
    else setInternalOpen(false);
  }

  function open() {
    setName(design?.name ?? "");
    setGarmentType((design?.garment_type as GarmentType) ?? "shirt");
    setVersion(design?.version ?? 1);
    setNotes(design?.notes ?? "");
    setError(null);
    setInternalOpen(true);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = isEdit
      ? await apiPatch(`/api/designs/${design.id}`, {
          name,
          garment_type: garmentType,
          version,
          notes: notes.trim() || null,
        })
      : await apiPost("/api/designs", {
          project_id: projectId,
          name,
          garment_type: garmentType,
          version,
          notes: notes.trim() || null,
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
      message: isEdit ? "Diseño actualizado." : "Diseño creado.",
    });
    router.refresh();
  }

  const titleId = isEdit ? `edit-design-${design.id}` : "create-design";

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
            {isEdit ? "Editar diseño" : "Nuevo diseño"}
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

          {!isEdit && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${titleId}-base-garment`}>
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
          )}

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
