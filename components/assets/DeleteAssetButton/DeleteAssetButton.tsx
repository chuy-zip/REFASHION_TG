"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete } from "@/lib/api-client";
import styles from "./DeleteAssetButton.module.css";

interface DeleteAssetButtonProps {
  assetId: string;
  assetLabel: string;
  open: boolean;
  onClose: () => void;
}

/** Always controlled: only ever triggered from AssetCard's gear menu. */
export function DeleteAssetButton({
  assetId,
  assetLabel,
  open,
  onClose,
}: DeleteAssetButtonProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);

    const result = await apiDelete(`/api/assets/${assetId}`);

    if (!result.ok) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    setIsDeleting(false);
    onClose();
    notify({ type: "success", message: `${assetLabel} eliminado.` });
    router.refresh();
  }

  const titleId = `delete-asset-${assetId}`;

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId}>
      <div className={styles.content}>
        <h2 className={styles.title} id={titleId}>
          Eliminar {assetLabel}
        </h2>
        <p className={styles.warning}>
          Se elimina también el archivo en almacenamiento. Esta acción no se
          puede deshacer.
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
