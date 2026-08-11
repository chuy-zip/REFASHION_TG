"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete, apiGet } from "@/lib/api-client";
import type { AssetUsage } from "@/lib/assets-server";
import styles from "./DeleteAssetButton.module.css";

interface DeleteAssetButtonProps {
  assetId: string;
  assetLabel: string;
  open: boolean;
  onClose: () => void;
}

function usageLabel(usage: AssetUsage): string {
  if (usage.as_image && usage.as_layer) return "imagen de trabajo y logotipo";
  return usage.as_image ? "imagen de trabajo" : "logotipo";
}

/**
 * Always controlled: only ever triggered from AssetCard's gear menu.
 *
 * Warns which designs use the image, and lets the user delete anyway (§7.3).
 * Blocking was considered and rejected: a design that loses an image degrades
 * fine, and a hard block would make the catalog impossible to tidy because of
 * some design from a project closed a year ago. The information is shown; the
 * decision stays with the user.
 */
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
  const [usage, setUsage] = useState<AssetUsage[] | null>(null);

  // Looked up when the dialog opens rather than listed with the catalog: it is
  // one query for one image, and only when someone is about to destroy it.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    apiGet<AssetUsage[]>(`/api/assets/${assetId}/usage`).then((result) => {
      if (!cancelled) setUsage(result.ok ? result.data : []);
    });

    return () => {
      cancelled = true;
    };
  }, [open, assetId]);

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

        {usage === null ? (
          <p className={styles.checking}>Revisando dónde se usa…</p>
        ) : usage.length > 0 ? (
          <div className={styles.usage}>
            <p className={styles.usageTitle}>
              {usage.length === 1
                ? "Esta imagen se usa en 1 diseño:"
                : `Esta imagen se usa en ${usage.length} diseños:`}
            </p>
            <ul className={styles.usageList}>
              {usage.map((item) => (
                <li key={item.design_id} className={styles.usageItem}>
                  {item.design_name} · v{item.design_version} ·{" "}
                  {usageLabel(item)}
                </li>
              ))}
            </ul>
            <p className={styles.usageHint}>
              Si la eliminas, esos diseños se quedan sin ella.
            </p>
          </div>
        ) : null}

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
