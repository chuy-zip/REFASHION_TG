"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import {
  ConfirmByName,
  confirmationMatches,
} from "@/components/ui/ConfirmByName/ConfirmByName";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiDelete, apiGet } from "@/lib/api-client";
import type { AssetUsage } from "@/lib/assets-server";
import styles from "./DeleteAssetButton.module.css";

interface DeleteAssetButtonProps {
  assetId: string;
  /** Type label: "Logotipo", "Prenda base". Used in the title and the toast. */
  assetLabel: string;
  /**
   * The file's own name, which is what the typed confirmation asks for. The
   * type label would not do: every logo shares it, so typing "Logotipo" would
   * confirm nothing about *which* image is being destroyed.
   */
  assetName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Three outcomes, not two. The first version stored `AssetUsage[] | null` and
 * turned a failed request into `[]`, which renders exactly like "used by
 * nobody" — the one thing this dialog exists to never say by mistake.
 *
 * The answer carries the image it is about, so it can be checked against the
 * one on screen instead of cleared when the dialog reopens.
 */
type UsageAnswer =
  | { assetId: string; status: "ready"; designs: AssetUsage[] }
  | { assetId: string; status: "failed" };

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
  assetName,
  open,
  onClose,
}: DeleteAssetButtonProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [answer, setAnswer] = useState<UsageAnswer | null>(null);

  // Looked up when the dialog opens rather than listed with the catalog: it is
  // one query for one image, and only when someone is about to destroy it.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    apiGet<AssetUsage[]>(`/api/assets/${assetId}/usage`).then((result) => {
      if (cancelled) return;
      setAnswer(
        result.ok
          ? { assetId, status: "ready", designs: result.data }
          : { assetId, status: "failed" }
      );
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

  /**
   * Derived rather than reset from an effect: an answer belonging to another
   * image reads as "still checking", which is both true and safe. Clearing it
   * from the effect would be a synchronous setState there, which React's rules
   * forbid — and this version also closes the race the reset only papered over.
   */
  const usage: UsageAnswer | { status: "checking" } =
    answer && answer.assetId === assetId ? answer : { status: "checking" };

  /**
   * The friction follows the blast radius, not the kind of thing.
   *
   * An image nobody uses is catalogue tidying — the derived "X sin fondo" pile
   * grows on purpose (§9), and gating routine cleanup behind typing is exactly
   * how the gesture becomes a reflex. An image several designs depend on is a
   * different act: it reaches across projects the user is not looking at, and
   * a list can be skimmed the same way a warning can.
   */
  const needsTyping = usage.status === "ready" && usage.designs.length > 0;
  const canDelete =
    usage.status !== "checking" &&
    (!needsTyping || confirmationMatches(confirmation, assetName));

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

        {usage.status === "checking" && (
          <p className={styles.checking} role="status">
            Revisando dónde se usa…
          </p>
        )}

        {usage.status === "failed" && (
          <p className={styles.usageHint} role="status">
            No se pudo comprobar en qué diseños se usa. Puedes eliminarla de
            todas formas, pero sin saber a quién afecta.
          </p>
        )}

        {usage.status === "ready" && usage.designs.length > 0 && (
          <div className={styles.usage}>
            <p className={styles.usageTitle}>
              {usage.designs.length === 1
                ? "Esta imagen se usa en 1 diseño:"
                : `Esta imagen se usa en ${usage.designs.length} diseños:`}
            </p>
            <ul className={styles.usageList}>
              {usage.designs.map((item) => (
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
        )}

        {needsTyping && (
          <ConfirmByName
            expected={assetName}
            value={confirmation}
            onChange={setConfirmation}
            disabled={isDeleting}
          />
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          {/* Held until the lookup answers. The warning IS the feature here
              (§7.3 chose to warn rather than block), so letting someone confirm
              before it arrives quietly removes the only thing this dialog adds
              over deleting straight from the menu. */}
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={isDeleting || !canDelete}
            title={
              usage.status === "checking"
                ? "Espera a saber en qué diseños se usa."
                : needsTyping
                  ? "Escribe el nombre de la imagen para confirmar."
                  : undefined
            }
          >
            {isDeleting ? "Eliminando…" : "Eliminar"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
