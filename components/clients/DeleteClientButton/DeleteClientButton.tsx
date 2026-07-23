"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import styles from "./DeleteClientButton.module.css";

interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
}

/**
 * Deletes a client after explicit confirmation. Only the owner can do it; a
 * non-owner gets the 403 message from the API rendered in place.
 */
export function DeleteClientButton({
  clientId,
  clientName,
}: DeleteClientButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);

    const response = await fetch(`/api/clients/${clientId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? "No se pudo eliminar el cliente.");
      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    setIsOpen(false);
    // The client no longer exists, so going back to its detail page would 404.
    router.replace("/clients");
    router.refresh();
  }

  const titleId = `delete-client-${clientId}`;

  return (
    <>
      <Button
        variant="danger"
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
