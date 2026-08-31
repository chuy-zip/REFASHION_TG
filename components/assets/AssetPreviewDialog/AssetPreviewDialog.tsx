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
            <dt className={styles.attrLabel}>Subido</dt>
            <dd className={styles.attrValue}>
              {formatDate(asset.created_at)}
            </dd>
          </div>
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
