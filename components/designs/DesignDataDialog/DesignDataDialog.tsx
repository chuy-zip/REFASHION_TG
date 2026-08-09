"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPatch } from "@/lib/api-client";
import {
  DESIGN_STATUS_COPY,
  GARMENT_TYPE_COPY,
  type GarmentType,
} from "@/lib/designs";
import type { Design, DesignStatus } from "@/lib/types";
import styles from "./DesignDataDialog.module.css";

const GARMENT_TYPES: GarmentType[] = ["shirt", "polo", "hoodie"];
const DESIGN_STATUSES: DesignStatus[] = ["draft", "active", "completed"];

interface DesignDataDialogProps {
  design: Design;
  /** Controlled only: the gear menu mounts it fresh each time it opens. */
  open: boolean;
  onClose: () => void;
}

/**
 * Edits a design's *data* (name, garment, status, notes). Deliberately not the
 * design itself — that happens on /designs/[id]/edit, which the row links to.
 * The split is why the menu item and this title both read "Editar datos".
 *
 * Creating a design does NOT live here: there is a single creation path, the
 * DesignWizard, reached from the sidebar and from a project.
 */
export function DesignDataDialog({
  design,
  open,
  onClose,
}: DesignDataDialogProps) {
  const router = useRouter();
  const { notify } = useToast();

  const [name, setName] = useState(design.name);
  const [garmentType, setGarmentType] = useState<GarmentType>(
    design.garment_type as GarmentType
  );
  const [status, setStatus] = useState<DesignStatus>(design.status);
  const [notes, setNotes] = useState(design.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await apiPatch<Design>(`/api/designs/${design.id}`, {
      name,
      garment_type: garmentType,
      status,
      notes: notes.trim() || null,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    notify({ type: "success", message: "Datos actualizados." });
    router.refresh();
  }

  const titleId = `design-data-${design.id}`;

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <h2 className={styles.title} id={titleId}>
          Editar datos
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
              value={design.version}
              readOnly
              disabled
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${titleId}-status`}>
            Estado
          </label>
          <select
            id={`${titleId}-status`}
            className={styles.input}
            value={status}
            onChange={(event) => setStatus(event.target.value as DesignStatus)}
            disabled={isSubmitting}
          >
            {DESIGN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {DESIGN_STATUS_COPY[value].label}
              </option>
            ))}
          </select>
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
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
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
  );
}
