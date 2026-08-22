"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import {
  ConfirmByName,
  confirmationMatches,
} from "@/components/ui/ConfirmByName/ConfirmByName";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete } from "@/lib/api-client";
import type { ProjectContents } from "@/lib/projects";
import { countPhrase } from "@/lib/text";
import styles from "./DeleteProjectButton.module.css";

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  /** What disappears with it; null when it could not be counted. */
  contents: ProjectContents | null;
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
  contents,
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
  const [confirmation, setConfirmation] = useState("");

  const canDelete = confirmationMatches(confirmation, projectName);

  const losing = contents
    ? countPhrase([
        [contents.design_count, "diseño", "diseños"],
        [contents.image_count, "imagen", "imágenes"],
      ])
    : null;

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
            {!contents
              ? "Se eliminarán también sus diseños e imágenes. No se pudo contar cuántos son. Esta acción no se puede deshacer."
              : losing
                ? `Se eliminarán ${losing}. Esta acción no se puede deshacer.`
                : "Este proyecto no tiene diseños. Esta acción no se puede deshacer."}
          </p>

          <ConfirmByName
            expected={projectName}
            value={confirmation}
            onChange={setConfirmation}
            disabled={isDeleting}
          />

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
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isDeleting || !canDelete}
              title={
                canDelete
                  ? undefined
                  : "Escribe el nombre del proyecto para confirmar."
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
