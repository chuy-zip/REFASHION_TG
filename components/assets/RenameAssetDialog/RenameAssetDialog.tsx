"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPatch } from "@/lib/api-client";
import {
  assetDisplayName,
  extensionForMimeType,
  stripExtension,
  type AssetWithUrl,
} from "@/lib/assets";
import styles from "./RenameAssetDialog.module.css";

interface RenameAssetDialogProps {
  asset: AssetWithUrl;
  onClose: () => void;
}

/**
 * Rename only: the extension is fixed (derived from the stored mime_type,
 * never from user input) so a rename can never make the displayed name lie
 * about what the file actually is.
 */
export function RenameAssetDialog({ asset, onClose }: RenameAssetDialogProps) {
  const router = useRouter();
  const { notify } = useToast();
  const extension = extensionForMimeType(asset.mime_type);

  const [baseName, setBaseName] = useState(() =>
    stripExtension(assetDisplayName(asset))
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (baseName.trim().length === 0) return;

    setError(null);
    setIsSubmitting(true);

    const result = await apiPatch(`/api/assets/${asset.id}`, {
      original_filename: `${baseName.trim()}.${extension}`,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    notify({ type: "success", message: "Recurso renombrado." });
    router.refresh();
  }

  const titleId = `rename-asset-${asset.id}`;

  return (
    <Dialog open onClose={onClose} labelledBy={titleId}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <h2 className={styles.title} id={titleId}>
          Renombrar recurso
        </h2>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${titleId}-name`}>
            Nombre
          </label>
          <input
            id={`${titleId}-name`}
            className={styles.input}
            value={baseName}
            onChange={(event) => setBaseName(event.target.value)}
            autoFocus
            required
            disabled={isSubmitting}
          />
          <p className={styles.hint}>
            Se guardará como {baseName.trim() || "…"}.{extension}
          </p>
        </div>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || baseName.trim().length === 0}
          >
            {isSubmitting ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
