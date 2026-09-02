"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/Button/Button";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import { uploadAcceptFor } from "@/lib/asset-upload";
import styles from "./LogoPicker.module.css";

interface LogoPickerProps {
  /** The client's catalogue, plus anything uploaded here that has not come back around yet. */
  logos: AssetWithUrl[];
  onAdd: (logo: AssetWithUrl) => void;
  onUpload: (file: File | null) => void;
  isUploading: boolean;
  /** Whether a logo can be placed on the canvas right now. */
  canAdd: boolean;
  /** Whether a new logo can be uploaded right now. */
  canUpload: boolean;
  /** Membership, not busy-ness: it is what the "no tienes permisos" title says. */
  canEdit: boolean;
}

/**
 * Choosing a logo to place, and adding one that is not there yet.
 *
 * Presentational: the layers live in the workspace, because the canvas, the
 * export and the persistence all read them. What this does own is the hidden
 * file input, because nothing outside needs it — the `Button` beside it is the
 * control, and a bare file input cannot be styled to match. Two visible
 * triggers for one action is the ambiguity the guide forbids.
 */
export function LogoPicker({
  logos,
  onAdd,
  onUpload,
  isUploading,
  canAdd,
  canUpload,
  canEdit,
}: LogoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {logos.length === 0 ? (
        <p className={styles.hint}>
          Este cliente no tiene logotipos todavía. Sube uno para colocarlo sobre
          la prenda.
        </p>
      ) : (
        <div className={styles.logoRow}>
          {logos.map((logo) => (
            <button
              key={logo.id}
              type="button"
              className={styles.logoButton}
              onClick={() => onAdd(logo)}
              disabled={!canAdd}
              title={assetDisplayName(logo)}
            >
              {/*
                crossOrigin is NOT decoration here. The canvas loads this exact
                URL as a CORS request; if this thumbnail fetches it first
                without CORS, R2 answers without an Access-Control-Allow-Origin
                header (no Origin was sent), the browser caches that response,
                and the canvas then reuses it and is blocked. Same URL, two
                request modes, one poisoned cache entry. Both must ask the same
                way.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
              <img
                className={styles.logoThumb}
                src={logo.url}
                alt={assetDisplayName(logo)}
                crossOrigin="anonymous"
              />
            </button>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        className={styles.fileInput}
        type="file"
        accept={uploadAcceptFor("logo")}
        onChange={(event) => {
          onUpload(event.target.files?.[0] ?? null);
          // Cleared right away so the same file can be picked again after a
          // failure: without this, choosing it a second time fires no change
          // event and the retry looks like a dead button. Safe to do now —
          // the File is already handed over.
          event.target.value = "";
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <Button
        variant="secondary"
        onClick={() => fileInputRef.current?.click()}
        disabled={!canUpload}
        title={canEdit ? undefined : "No tienes permisos para editar este cliente."}
      >
        {isUploading ? "Subiendo…" : "+ Subir logotipo"}
      </Button>
      <p className={styles.hint}>
        PNG, JPEG, WEBP o SVG. Un SVG se convierte a PNG al subirlo.
      </p>
    </>
  );
}
