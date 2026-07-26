"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete } from "@/lib/api-client";
import styles from "./DeleteClientButton.module.css";

interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
  /** When set, the trigger is disabled and shows this reason on hover. */
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Deletes a client after explicit confirmation. Only the owner (or a global
 * admin) can do it; the button is disabled for anyone else, and RLS is the
 * backstop if the disabled state is ever bypassed.
 */
export function DeleteClientButton({
  clientId,
  clientName,
  disabled = false,
  disabledReason,
}: DeleteClientButtonProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
    setIsOpen(false);
    notify({ type: "success", message: `${clientName} se eliminó.` });
    // The client no longer exists, so going back to its detail page would 404.
    router.replace("/clients");
    router.refresh();
  }

  const titleId = `delete-client-${clientId}`;

  return (
    <>
      <Button
        variant="danger"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
      >
        Eliminar
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        labelledBy={titleId}
      >
        <div className={styles.content}>
          <h2 className={styles.title} id={titleId}>
            Eliminar {clientName}
          </h2>

          <p className={styles.warning}>
            Se eliminarán también sus proyectos, diseños e imágenes asociadas.
            Esta acción no se puede deshacer.
          </p>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => setIsOpen(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
