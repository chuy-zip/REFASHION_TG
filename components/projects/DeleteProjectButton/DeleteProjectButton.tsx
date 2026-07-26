"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete } from "@/lib/api-client";
import styles from "./DeleteProjectButton.module.css";

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  /** Where to go after deletion (the parent client). */
  clientId: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Controlled mode: parent drives visibility and renders no trigger. */
  open?: boolean;
  onClose?: () => void;
}

export function DeleteProjectButton({
  projectId,
  projectName,
  clientId,
  disabled = false,
  disabledReason,
  open: controlledOpen,
  onClose,
}: DeleteProjectButtonProps) {
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

    const result = await apiDelete(`/api/projects/${projectId}`);

    if (!result.ok) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    close();
    notify({ type: "success", message: `${projectName} se eliminó.` });
    // The project no longer exists; return to its client.
    router.replace(`/clients/${clientId}`);
    router.refresh();
  }

  const titleId = `delete-project-${projectId}`;

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
            Eliminar {projectName}
          </h2>
          <p className={styles.warning}>
            Se eliminarán también sus diseños e imágenes asociadas. Esta acción
            no se puede deshacer.
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
