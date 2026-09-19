"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import {
  ConfirmByName,
  confirmationMatches,
} from "@/components/ui/ConfirmByName/ConfirmByName";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete, apiGet } from "@/lib/api-client";
import type { DesignDependent } from "@/lib/assets-server";
import styles from "./DeleteDesignButton.module.css";

/**
 * Three outcomes, not two — the same shape `DeleteAssetButton` settled on, and
 * for the same reason: turning a failed request into `[]` renders exactly like
 * "nothing depends on it", which is the one thing this dialog must never say by
 * mistake.
 *
 * The answer carries the design it is about, so a stale one reads as "still
 * checking" instead of being cleared from an effect.
 */
type DependentsAnswer =
  | { designId: string; status: "ready"; designs: DesignDependent[] }
  | { designId: string; status: "failed" };

function dependentLabel(dependent: DesignDependent): string {
  if (dependent.loses_image && dependent.loses_lineage) {
    return "parte de este diseño";
  }
  return dependent.loses_image ? "usa una de sus imágenes" : "es una iteración suya";
}

interface DeleteDesignButtonProps {
  designId: string;
  designName: string;
  /** How many images go with it. */
  assetCount: number;
  disabled?: boolean;
  disabledReason?: string;
  /** Controlled mode: parent drives visibility and renders no trigger. */
  open?: boolean;
  onClose?: () => void;
  /**
   * Where to go after deleting. Needed when the caller is the design's own
   * page: refreshing it would re-run a Server Component that now finds nothing
   * and answers 404. From a list, refreshing in place is the right behaviour.
   */
  redirectTo?: string;
}

export function DeleteDesignButton({
  designId,
  designName,
  assetCount,
  disabled = false,
  disabledReason,
  open: controlledOpen,
  onClose,
  redirectTo,
}: DeleteDesignButtonProps) {
  const router = useRouter();
  const { notify } = useToast();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [answer, setAnswer] = useState<DependentsAnswer | null>(null);

  // Asked when the dialog opens, not listed with the designs: it is one query
  // for one design, and only when someone is about to destroy it.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    apiGet<DesignDependent[]>(`/api/designs/${designId}/dependents`).then(
      (result) => {
        if (cancelled) return;
        setAnswer(
          result.ok
            ? { designId, status: "ready", designs: result.data }
            : { designId, status: "failed" }
        );
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isOpen, designId]);

  function close() {
    if (isControlled) onClose?.();
    else setInternalOpen(false);
  }

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);

    const result = await apiDelete(`/api/designs/${designId}`);

    if (!result.ok) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    close();
    notify({ type: "success", message: `${designName} se eliminó.` });

    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  const dependents: DependentsAnswer | { status: "checking" } =
    answer && answer.designId === designId ? answer : { status: "checking" };

  /**
   * The friction follows the blast radius, not the kind of thing.
   *
   * Deleting a design nobody built on is ordinary tidying, and gating that
   * behind typing is how the gesture becomes a reflex. Deleting one that
   * another design starts from is a different act: it empties a canvas the user
   * is not looking at, in a design they may have forgotten exists.
   *
   * Only `loses_image` escalates. Losing the lineage note is a real loss but a
   * recoverable one — nothing stops working.
   */
  const breaksAnother =
    dependents.status === "ready" &&
    dependents.designs.some((item) => item.loses_image);

  const canDelete =
    dependents.status !== "checking" &&
    (!breaksAnother || confirmationMatches(confirmation, designName));

  const titleId = `delete-design-${designId}`;

  return (
    <>
      {!isControlled && (
        <Button
          variant="danger"
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          onClick={() => {
            setError(null);
            setInternalOpen(true);
          }}
        >
          Eliminar
        </Button>
      )}

      <Dialog open={isOpen} onClose={close} labelledBy={titleId}>
        <div className={styles.content}>
          <h2 className={styles.title} id={titleId}>
            Eliminar {designName}
          </h2>
          <p className={styles.warning}>
            {assetCount === 0
              ? "Este diseño todavía no tiene imágenes. Esta acción no se puede deshacer."
              : `Se eliminarán también sus ${assetCount} ${
                  assetCount === 1 ? "imagen" : "imágenes"
                }. Esta acción no se puede deshacer.`}
          </p>

          {dependents.status === "checking" && (
            <p className={styles.checking} role="status">
              Revisando qué diseños dependen de este…
            </p>
          )}

          {dependents.status === "failed" && (
            <p className={styles.usageHint} role="status">
              No se pudo comprobar qué diseños dependen de este. Puedes
              eliminarlo de todas formas, pero sin saber a quién afecta.
            </p>
          )}

          {/* This dialog used to promise that the cascade stopped here. It does
              not: a design created from this one copied one of its images as
              its starting point, and `assets.design_id` cascades. So deleting
              this one empties that canvas. Warning and not blocking, the same
              call §7.3 already made for images. */}
          {dependents.status === "ready" && dependents.designs.length > 0 && (
            <div className={styles.usage}>
              <p className={styles.usageTitle}>
                {dependents.designs.length === 1
                  ? "1 diseño depende de este:"
                  : `${dependents.designs.length} diseños dependen de este:`}
              </p>
              <ul className={styles.usageList}>
                {dependents.designs.map((item) => (
                  <li key={item.design_id} className={styles.usageItem}>
                    {item.design_name} · v{item.design_version} ·{" "}
                    {dependentLabel(item)}
                  </li>
                ))}
              </ul>
              <p className={styles.usageHint}>
                {breaksAnother
                  ? "Si lo eliminas, esos diseños se quedan sin su imagen de partida."
                  : "Si lo eliminas, esos diseños dejan de indicar de dónde salieron."}
              </p>
            </div>
          )}

          {breaksAnother && (
            <ConfirmByName
              expected={designName}
              value={confirmation}
              onChange={setConfirmation}
              disabled={isDeleting}
            />
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={close}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            {/* Held until the lookup answers. The warning IS the feature
                here, so letting someone confirm before it arrives quietly
                removes the only thing this dialog adds. */}
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isDeleting || !canDelete}
              title={
                dependents.status === "checking"
                  ? "Revisando qué diseños dependen de este"
                  : undefined
              }
            >
              {isDeleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
