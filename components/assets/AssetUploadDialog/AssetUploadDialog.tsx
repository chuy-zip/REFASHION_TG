"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPost } from "@/lib/api-client";
import {
  ASSET_TYPE_COPY,
  extensionForMimeType,
  stripExtension,
  type AssetWithUrl,
} from "@/lib/assets";
import type { ClientAssetType } from "@/lib/types";
import styles from "./AssetUploadDialog.module.css";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface PresignResponse {
  upload_url: string;
  r2_key: string;
  asset_id: string;
}

interface AssetUploadDialogProps {
  clientId: string;
  assetType: ClientAssetType;
  triggerVariant?: ButtonVariant;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Upload flow for one client-level catalog asset: presign -> PUT straight to
 * R2 -> confirm. Reused across the four catalog types; only `assetType`
 * changes, so the R2 key and the copy stay correct without four components.
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

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError("Formato no soportado. Usa PNG, JPEG o WEBP.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("No se pudo subir la imagen. El archivo supera los 10 MB.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const presign = await apiPost<PresignResponse>(
      "/api/assets/presign-upload",
      { client_id: clientId, content_type: file.type }
    );

    if (!presign.ok) {
      setError(presign.error);
      setIsSubmitting(false);
      return;
    }

    const { upload_url, r2_key, asset_id } = presign.data;

    let putResponse: Response;
    try {
      putResponse = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
    } catch {
      setError("No se pudo subir la imagen. Revisa tu conexión.");
      setIsSubmitting(false);
      return;
    }

    if (!putResponse.ok) {
      setError("No se pudo subir la imagen a almacenamiento.");
      setIsSubmitting(false);
      return;
    }

    const confirm = await apiPost<AssetWithUrl>("/api/assets/confirm", {
      asset_id,
      client_id: clientId,
      r2_key,
      asset_type: assetType,
      original_filename: `${baseName.trim()}.${extensionForMimeType(file.type)}`,
      mime_type: file.type,
      file_size_bytes: file.size,
    });

    setIsSubmitting(false);

    if (!confirm.ok) {
      setError(confirm.error);
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
              accept={ALLOWED_MIME_TYPES.join(",")}
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
