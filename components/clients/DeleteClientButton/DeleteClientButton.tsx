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
import type { ClientContents } from "@/lib/clients";
import { countPhrase } from "@/lib/text";
import styles from "./DeleteClientButton.module.css";

interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
  /**
   * What disappears with it. Null when the count could not be read, which is
   * shown as such: "nothing will be lost" is the one thing this dialog must
   * never say by mistake.
   */
  contents: ClientContents | null;
  /** When set, the trigger is disabled and shows this reason on hover. */
  disabled?: boolean;
  disabledReason?: string;
  /** Controlled mode: parent drives visibility and renders no trigger. */
  open?: boolean;
  onClose?: () => void;
}

/**
 * Deletes a client after explicit confirmation. Only the owner (or a global
 * admin) can do it; RLS is the backstop if the guard is ever bypassed.
 */
export function DeleteClientButton({
  clientId,
  clientName,
  contents,
  disabled = false,
  disabledReason,
  open: controlledOpen,
  onClose,
}: DeleteClientButtonProps) {
  const router = useRouter();
  const { notify } = useToast();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const canDelete = confirmationMatches(confirmation, clientName);

  const losing = contents
    ? countPhrase([
        [contents.project_count, "proyecto", "proyectos"],
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

    const result = await apiDelete(`/api/clients/${clientId}`);

    if (!result.ok) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    close();
    notify({ type: "success", message: `${clientName} se eliminó.` });
    // The client no longer exists, so going back to its detail page would 404.
    router.replace("/clients");
    router.refresh();
  }

  const titleId = `delete-client-${clientId}`;

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
            Eliminar {clientName}
          </h2>

          {/* The numbers, not the abstract plural. A client with nothing and a
              client with forty projects used to show the identical sentence,
              which is exactly when a confirmation stops informing anything. */}
          <p className={styles.warning}>
            {!contents
              ? "Se eliminarán también sus proyectos, diseños e imágenes. No se pudo contar cuántos son. Esta acción no se puede deshacer."
              : losing
                ? `Se eliminarán ${losing}. Esta acción no se puede deshacer.`
                : "Este cliente no tiene proyectos ni imágenes. Esta acción no se puede deshacer."}
          </p>

          <ConfirmByName
            expected={clientName}
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
            <Button variant="secondary" onClick={close} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isDeleting || !canDelete}
              title={
                canDelete ? undefined : "Escribe el nombre del cliente para confirmar."
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
