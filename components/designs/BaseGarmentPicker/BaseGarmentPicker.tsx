"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import {
  StartingPointPicker,
  type StartingPoint,
} from "@/components/designs/StartingPointPicker/StartingPointPicker";
import { apiGet, apiPatch } from "@/lib/api-client";
import type { AssetWithUrl } from "@/lib/assets";
import type { Design } from "@/lib/types";
import styles from "./BaseGarmentPicker.module.css";

interface BaseGarmentPickerProps {
  designId: string;
  /** Owner of the catalog the picker reads from and uploads into. */
  clientId: string;
  /** The design's current base garment, preselected when opening. */
  baseAssetId: string | null;
  canEdit: boolean;
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
}

/**
 * Assigns (or replaces) a design's base garment from the working screen, so a
 * design created without one is not stuck: until now the only way to set it was
 * at creation time, and the empty canvas was a dead end.
 *
 * Existing designs are deliberately absent from the picker here: starting from
 * another design is *iterating*, a decision that belongs to creation and that
 * derives version and lineage. Changing this design's base garment is not that.
 */
export function BaseGarmentPicker({
  designId,
  clientId,
  baseAssetId,
  canEdit,
  triggerLabel,
  triggerVariant = "secondary",
}: BaseGarmentPickerProps) {
  const router = useRouter();
  const { notify } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [assets, setAssets] = useState<AssetWithUrl[]>([]);
  const [value, setValue] = useState<StartingPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function open() {
    setValue(baseAssetId ? { kind: "asset", id: baseAssetId } : null);
    setError(null);
    setIsOpen(true);

    // Fetched on open, not handed down by the page: the signed thumbnail URLs
    // are then always fresh, however long the screen has been sitting open.
    setIsLoading(true);
    const result = await apiGet<AssetWithUrl[]>(
      `/api/assets?client_id=${clientId}`
    );
    setAssets(result.ok ? result.data : []);
    if (!result.ok) setError(result.error);
    setIsLoading(false);
  }

  function close() {
    setIsOpen(false);
  }

  function handleAssetUploaded(asset: AssetWithUrl) {
    setAssets((current) => [asset, ...current]);
    setValue({ kind: "asset", id: asset.id });
  }

  async function handleSave() {
    setError(null);
    setIsSaving(true);

    const result = await apiPatch<Design>(`/api/designs/${designId}`, {
      base_asset_id: value?.kind === "asset" ? value.id : null,
    });

    setIsSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    close();
    notify({ type: "success", message: "Prenda base actualizada." });
    router.refresh();
  }

  const titleId = `base-garment-${designId}`;

  return (
    <>
      <Button
        variant={triggerVariant}
        onClick={open}
        disabled={!canEdit}
        title={
          canEdit
            ? undefined
            : "Tu rol en este cliente no permite editar el diseño."
        }
      >
        {triggerLabel}
      </Button>

      <Dialog
        open={isOpen}
        onClose={close}
        labelledBy={titleId}
        className={styles.dialogWide}
      >
        <div className={styles.body}>
          <h2 className={styles.title} id={titleId}>
            Prenda base
          </h2>
          <p className={styles.hint}>
            Elige una imagen del catálogo del cliente o sube una nueva. Es la
            imagen sobre la que trabaja el lienzo.
          </p>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {isLoading ? (
            <div className={styles.loading}>Cargando el catálogo…</div>
          ) : (
            <StartingPointPicker
              clientId={clientId}
              assets={assets}
              includeDesigns={false}
              value={value}
              onChange={setValue}
              onAssetUploaded={handleAssetUploaded}
            />
          )}

          <div className={styles.actions}>
            <Button variant="secondary" onClick={close} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={isLoading || isSaving}
            >
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
