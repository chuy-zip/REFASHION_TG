"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { UPLOAD_ACCEPT, uploadClientAsset } from "@/lib/asset-upload";
import {
  ASSET_TYPE_COPY,
  extensionForMimeType,
  stripExtension,
} from "@/lib/assets";
import type { ClientAssetType } from "@/lib/types";
import styles from "./AssetUploadDialog.module.css";

interface AssetUploadDialogProps {
  clientId: string;
  assetType: ClientAssetType;
  triggerVariant?: ButtonVariant;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Dialog wrapper around `uploadClientAsset` for the client's Recursos tab.
 * Reused across the four catalog types; only `assetType` changes, so the R2 key
 * and the copy stay correct without four components.
 */
export function AssetUploadDialog({
  clientId,
  assetType,
  triggerVariant = "primary",
  disabled = false,
  disabledReason,
}: AssetUploadDialogProps) {
  const router = useRouter();
  const { notify } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [baseName, setBaseName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = ASSET_TYPE_COPY[assetType];

  function open() {
    setFile(null);
    setBaseName("");
    setError(null);
    setIsOpen(true);
  }

  function close() {
    setIsOpen(false);
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    // Seed an editable name from the picked file — "screenshot-2026" instead
    // of a name the user never chose. The extension is never taken from here.
    setBaseName(selected ? stripExtension(selected.name) : "");
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (!file || baseName.trim().length === 0) return;

    setError(null);
    setIsSubmitting(true);

    const result = await uploadClientAsset({
      clientId,
      assetType,
      file,
      baseName,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    close();
    notify({ type: "success", message: `${copy.label} subido.` });
    router.refresh();
  }

  const titleId = `upload-asset-${assetType}`;

  return (
    <>
      <Button
        variant={triggerVariant}
        onClick={open}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        + Subir {copy.label.toLowerCase()}
      </Button>

      <Dialog open={isOpen} onClose={close} labelledBy={titleId}>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h2 className={styles.title} id={titleId}>
            Subir {copy.label.toLowerCase()}
          </h2>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${titleId}-file`}>
              Archivo
            </label>
            <input
              id={`${titleId}-file`}
              className={styles.input}
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={(event) =>
                handleFileChange(event.target.files?.[0] ?? null)
              }
              disabled={isSubmitting}
              autoFocus
              required
            />
            <p className={styles.hint}>PNG, JPEG o WEBP. Máximo 10 MB.</p>
          </div>

          {file && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${titleId}-name`}>
                Nombre
              </label>
              <input
                id={`${titleId}-name`}
                className={styles.input}
                value={baseName}
                onChange={(event) => setBaseName(event.target.value)}
                required
                disabled={isSubmitting}
              />
              <p className={styles.hint}>
                Se guardará como {baseName.trim() || "…"}.
                {extensionForMimeType(file.type)}
              </p>
            </div>
          )}

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={close}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !file || baseName.trim().length === 0}
            >
              {isSubmitting ? "Subiendo…" : "Subir"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
