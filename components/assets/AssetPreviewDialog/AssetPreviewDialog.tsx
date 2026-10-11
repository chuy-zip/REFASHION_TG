import { Dialog } from "@/components/ui/Dialog/Dialog";
import { Button } from "@/components/ui/Button/Button";
import buttonStyles from "@/components/ui/Button/Button.module.css";
import {
  assetDisplayName,
  assetTypeLabel,
  formatFileSize,
  type AssetWithUrl,
} from "@/lib/assets";
import styles from "./AssetPreviewDialog.module.css";

interface AssetPreviewDialogProps {
  asset: AssetWithUrl;
  onClose: () => void;
}

/**
 * What the date means, which depends on where the image came from.
 *
 * It said "Subido" for everything, including a model photo the system drew and
 * a composition it flattened. `derived` gets "Creado" rather than "Generado"
 * because those come from a deterministic step (a cut-out, a composition, a
 * recolour), and "generado" reads as AI everywhere else in the app.
 */
const DATE_LABEL: Record<AssetWithUrl["origin"], string> = {
  upload: "Subido",
  generated: "Generado",
  derived: "Creado",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-GT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Full-size view of one asset: image, its attributes (the filename in
 * particular — AssetCard truncates it) and a download link. View-only: the
 * delete action stays on the card's gear menu, not duplicated here.
 */
export function AssetPreviewDialog({ asset, onClose }: AssetPreviewDialogProps) {
  const filename = assetDisplayName(asset);
  const size = formatFileSize(asset.file_size_bytes);
  const titleId = `preview-asset-${asset.id}`;

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy={titleId}
      className={styles.dialog}
    >
      <div className={styles.content}>
        <h2 className={styles.title} id={titleId} title={filename}>
          {filename}
        </h2>

        <div className={styles.imageWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
          <img className={styles.image} src={asset.url} alt={filename} crossOrigin="anonymous" />
        </div>

        <dl className={styles.attrs}>
          <div className={styles.attr}>
            <dt className={styles.attrLabel}>Tipo</dt>
            <dd className={styles.attrValue}>
              {assetTypeLabel(asset.asset_type)}
            </dd>
          </div>
          <div className={styles.attr}>
            <dt className={styles.attrLabel}>Formato</dt>
            <dd className={`${styles.attrValue} ${styles.mono}`}>
              {asset.mime_type}
            </dd>
          </div>
          {size && (
            <div className={styles.attr}>
              <dt className={styles.attrLabel}>Tamaño</dt>
              <dd className={`${styles.attrValue} ${styles.mono}`}>{size}</dd>
            </div>
          )}
          <div className={styles.attr}>
            <dt className={styles.attrLabel}>{DATE_LABEL[asset.origin]}</dt>
            <dd className={styles.attrValue}>
              {formatDate(asset.created_at)}
            </dd>
          </div>
          {/* Only when there is one. A model photo is paid once and lives in
              the client's catalogue, outside any design's running total, so
              this is the one place its price can be read. Null means free or
              unknown, and showing $0.0000 would claim the first. */}
          {asset.cost_usd !== null && (
            <div className={styles.attr}>
              <dt className={styles.attrLabel}>Costo</dt>
              <dd className={`${styles.attrValue} ${styles.mono}`}>
                ${asset.cost_usd.toFixed(4)}
              </dd>
            </div>
          )}
        </dl>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <a
            className={`${buttonStyles.base} ${buttonStyles.primary} ${styles.downloadLink}`}
            href={asset.downloadUrl}
            download={filename}
          >
            Descargar
          </a>
        </div>
      </div>
    </Dialog>
  );
}
