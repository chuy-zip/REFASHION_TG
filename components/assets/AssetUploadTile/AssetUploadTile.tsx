"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Icon } from "@/components/ui/Icon/Icon";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import {
  storedExtensionFor,
  uploadAcceptFor,
  uploadClientAsset,
  validateUploadBlob,
} from "@/lib/asset-upload";
import { ASSET_TYPE_COPY, stripExtension } from "@/lib/assets";
import { isSvgFile } from "@/lib/svg-raster";
import type { ClientAssetType } from "@/lib/types";
import styles from "./AssetUploadTile.module.css";

interface AssetUploadTileProps {
  clientId: string;
  /** The type the tile files into: whichever pill is selected. */
  assetType: ClientAssetType;
}

/**
 * First tile of the catalog grid, and the only way to add an image to it.
 *
 * It replaced a "+ Subir" button in the toolbar above: the place where images
 * appear is now the same place where they are added, and an empty catalog
 * shows what to do without a sentence explaining it.
 *
 * Picking a file turns this tile into the form *for that file*, in place. That
 * second step is not the trap of §6.4.1 (a button confirming a decision already
 * made) — it exists to name the image, which is the one thing the file itself
 * cannot decide. A dialog would have done the same job while covering the grid
 * the user is looking at to decide what is missing.
 */
export function AssetUploadTile({ clientId, assetType }: AssetUploadTileProps) {
  const router = useRouter();
  const { notify } = useToast();
  const copy = ASSET_TYPE_COPY[assetType];

  const [pending, setPending] = useState<{ file: File; url: string } | null>(
    null
  );
  const [baseName, setBaseName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The object URL lives exactly as long as the tile is showing that file.
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.url);
  }, [pending]);

  function reset() {
    setPending(null);
    setBaseName("");
    setError(null);
  }

  function handleFileChange(file: File | null) {
    if (!file) return;

    // Checked here rather than at submit so an unusable file is refused while
    // the user still has the picker in mind. SVG skips it: it is not storable
    // as-is, it becomes a PNG on the way out (lib/svg-raster.ts).
    const invalid = isSvgFile(file) ? null : validateUploadBlob(file);
    if (invalid) {
      setPending(null);
      setError(invalid);
      return;
    }

    setError(null);
    setPending({ file, url: URL.createObjectURL(file) });
    setBaseName(stripExtension(file.name));
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    if (!pending || baseName.trim().length === 0) return;

    setError(null);
    setIsSubmitting(true);

    const result = await uploadClientAsset({
      clientId,
      assetType,
      file: pending.file,
      baseName,
    });

    setIsSubmitting(false);

    // The file stays selected on failure: retrying should not cost a second
    // trip through the file picker.
    if (!result.ok) {
      setError(result.error);
      return;
    }

    reset();
    notify({ type: "success", message: `${copy.label} subido.` });
    router.refresh();
  }

  if (!pending) {
    const formats =
      assetType === "logo"
        ? "PNG, JPEG, WEBP o SVG. Máximo 10 MB."
        : "PNG, JPEG o WEBP. Máximo 10 MB.";

    return (
      <div className={styles.tile}>
        <label className={styles.zone}>
          {/* Transparent and click-through; the label around it is the hit
              area, so the whole tile opens the picker. See the module CSS. */}
          <input
            type="file"
            className={styles.file}
            accept={uploadAcceptFor(assetType)}
            onChange={(event) => {
              handleFileChange(event.target.files?.[0] ?? null);
              // Lets the same file be picked again after cancelling it.
              event.target.value = "";
            }}
          />
          <Icon name="plus" size={20} />
          <span className={styles.action}>
            Subir {copy.label.toLowerCase()}
          </span>
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={styles.caption}>{formats}</p>
        )}
      </div>
    );
  }

  const nameId = `upload-tile-${assetType}`;

  return (
    <form className={styles.tile} onSubmit={handleSubmit} noValidate>
      {/* Still dashed: nothing has been uploaded yet. */}
      <div className={styles.previewWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL of a file that never left the browser; there is nothing for next/image to fetch or optimise */}
        <img className={styles.preview} src={pending.url} alt="" />
      </div>

      <input
        id={nameId}
        className={styles.name}
        value={baseName}
        onChange={(event) => setBaseName(event.target.value)}
        aria-label={`Nombre de ${copy.label.toLowerCase()}`}
        disabled={isSubmitting}
        autoFocus
        required
      />

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.caption}>
          Se guardará como {baseName.trim() || "…"}.
          {storedExtensionFor(pending.file)}
          {isSvgFile(pending.file) &&
            " El SVG se convierte a PNG de alta resolución, así que su texto debe estar convertido a trazos."}
        </p>
      )}

      <div className={styles.actions}>
        <Button
          type="submit"
          variant="primary"
          className={styles.submit}
          disabled={isSubmitting || baseName.trim().length === 0}
        >
          {isSubmitting ? "Subiendo…" : "Subir"}
        </Button>
        <Button variant="ghost" onClick={reset} disabled={isSubmitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
