"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete } from "@/lib/api-client";
import styles from "./DeleteDesignButton.module.css";

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
          {/* No typed confirmation here on purpose: the cascade stops at this
              design, and spending that friction everywhere is what turns it
              into a reflex. The number is the part that informs. */}
          <p className={styles.warning}>
            {assetCount === 0
              ? "Este diseño todavía no tiene imágenes. Esta acción no se puede deshacer."
              : `Se eliminarán también sus ${assetCount} ${
                  assetCount === 1 ? "imagen" : "imágenes"
                }. Esta acción no se puede deshacer.`}
          </p>

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
            <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
