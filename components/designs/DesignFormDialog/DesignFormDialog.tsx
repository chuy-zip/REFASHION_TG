"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import {
  StartingPointPicker,
  type StartingPoint,
} from "@/components/designs/StartingPointPicker/StartingPointPicker";
import { apiPatch, apiPost } from "@/lib/api-client";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import {
  DESIGN_STATUS_COPY,
  GARMENT_TYPE_COPY,
  type DesignOption,
  type GarmentType,
} from "@/lib/designs";
import type { Design, DesignStatus } from "@/lib/types";
import styles from "./DesignFormDialog.module.css";

const GARMENT_TYPES: GarmentType[] = ["shirt", "polo", "hoodie"];
const DESIGN_STATUSES: DesignStatus[] = ["draft", "active", "completed"];

interface DesignFormDialogProps {
  /** Parent project; required to create. */
  projectId: string;
  /** Present => edit that design (PATCH). Absent => create (POST). */
  design?: Design;
  /** Client's catalog images, offered as a starting point when creating. */
  assets?: AssetWithUrl[];
  /** Existing designs of this project, offered as iteration parents. */
  designs?: DesignOption[];
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
  assets = [],
  designs = [],
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
  // The picker takes over the dialog body rather than opening a second modal
  // on top of this one (see APRENDIZAJES §5.6 on avoiding the double modal).
  const [isPicking, setIsPicking] = useState(false);
  const [name, setName] = useState(design?.name ?? "");
  const [startingPoint, setStartingPoint] = useState<StartingPoint | null>(null);
  const [garmentType, setGarmentType] = useState<GarmentType>(
    (design?.garment_type as GarmentType) ?? "shirt"
  );
  // Only meaningful when editing: a new design always starts as 'draft'.
  const [status, setStatus] = useState<DesignStatus>(design?.status ?? "draft");
  const [notes, setNotes] = useState(design?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parentDesign =
    startingPoint?.kind === "design"
      ? designs.find((option) => option.id === startingPoint.id) ?? null
      : null;

  const nextVersion = parentDesign ? parentDesign.version + 1 : 1;

  const startingPointLabel = (() => {
    if (!startingPoint) return "Sin punto de partida";
    if (startingPoint.kind === "asset") {
      const asset = assets.find((candidate) => candidate.id === startingPoint.id);
      return asset ? assetDisplayName(asset) : "Imagen seleccionada";
    }
    return parentDesign
      ? `${parentDesign.name} · v${parentDesign.version}`
      : "Diseño seleccionado";
  })();

  function close() {
    setIsPicking(false);
    if (isControlled) onClose?.();
    else setInternalOpen(false);
  }

  function open() {
    setName(design?.name ?? "");
    setStartingPoint(null);
    setGarmentType((design?.garment_type as GarmentType) ?? "shirt");
    setStatus(design?.status ?? "draft");
    setNotes(design?.notes ?? "");
    setError(null);
    setIsPicking(false);
    setInternalOpen(true);
  }

  function confirmPick() {
    // Iterating carries the parent's identity forward; both stay editable.
    if (parentDesign) {
      setName(parentDesign.name);
      setGarmentType(parentDesign.garment_type as GarmentType);
    }
    setIsPicking(false);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = isEdit
      ? await apiPatch<Design>(`/api/designs/${design.id}`, {
          name,
          garment_type: garmentType,
          status,
          notes: notes.trim() || null,
        })
      : await apiPost<Design>("/api/designs", {
          project_id: projectId,
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

    if (isEdit) {
      notify({ type: "success", message: "Diseño actualizado." });
      router.refresh();
      return;
    }

    notify({ type: "success", message: "Diseño creado." });
    router.push(`/designs/${result.data.id}/edit`);
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

      <Dialog
        open={isOpen}
        onClose={close}
        labelledBy={titleId}
        className={isPicking ? styles.dialogWide : undefined}
      >
        {isPicking ? (
          <div className={styles.form}>
            <h2 className={styles.title} id={titleId}>
              Punto de partida
            </h2>
            <p className={styles.hint}>
              Elige una imagen del catálogo, o un diseño existente para crear su
              siguiente versión.
            </p>

            <StartingPointPicker
              assets={assets}
              designs={designs}
              value={startingPoint}
              onChange={setStartingPoint}
            />

            <div className={styles.actions}>
              <Button variant="primary" onClick={confirmPick}>
                Listo
              </Button>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <h2 className={styles.title} id={titleId}>
              {isEdit ? "Editar diseño" : "Nuevo diseño"}
            </h2>

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

            {!isEdit && (
              <div className={styles.field}>
                <span className={styles.label}>
                  Punto de partida{" "}
                  <span className={styles.optional}>(opcional)</span>
                </span>
                <div className={styles.pickerRow}>
                  <span className={styles.pickerValue}>
                    {startingPointLabel}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setIsPicking(true)}
                    disabled={isSubmitting}
                  >
                    {startingPoint ? "Cambiar" : "Elegir"}
                  </Button>
                </div>
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
                  value={isEdit ? design.version : nextVersion}
                  readOnly
                  disabled
                />
              </div>
            </div>

            {isEdit && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor={`${titleId}-status`}>
                  Estado
                </label>
                <select
                  id={`${titleId}-status`}
                  className={styles.input}
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as DesignStatus)
                  }
                  disabled={isSubmitting}
                >
                  {DESIGN_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {DESIGN_STATUS_COPY[value].label}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
              <Button variant="secondary" onClick={close} disabled={isSubmitting}>
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
        )}
      </Dialog>
    </>
  );
}
