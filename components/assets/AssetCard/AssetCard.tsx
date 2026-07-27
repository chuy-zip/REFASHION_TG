"use client";

import { useState } from "react";
import { Menu, type MenuItem } from "@/components/ui/Menu/Menu";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import { DeleteAssetButton } from "@/components/assets/DeleteAssetButton/DeleteAssetButton";
import { RenameAssetDialog } from "@/components/assets/RenameAssetDialog/RenameAssetDialog";
import { AssetPreviewDialog } from "@/components/assets/AssetPreviewDialog/AssetPreviewDialog";
import { assetTypeLabel, formatFileSize, type AssetWithUrl } from "@/lib/assets";
import styles from "./AssetCard.module.css";

interface AssetCardProps {
  asset: AssetWithUrl;
  /** owner/editor (or admin) of the client may delete. */
  canEdit: boolean;
}

export function AssetCard({ asset, canEdit }: AssetCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const label = assetTypeLabel(asset.asset_type);
  const size = formatFileSize(asset.file_size_bytes);

  const items: MenuItem[] = [
    {
      label: "Renombrar",
      onSelect: () => setIsRenaming(true),
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite renombrar recursos.",
    },
    {
      label: "Eliminar",
      onSelect: () => setIsDeleting(true),
      danger: true,
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite eliminar recursos.",
    },
  ];

  return (
    <div className={styles.card}>
      <button
        type="button"
        className={styles.preview}
        onClick={() => setIsPreviewOpen(true)}
        aria-label={`Ver ${label.toLowerCase()}`}
      >
        <div className={styles.thumbWrap}>
          {!isLoaded && <Skeleton className={styles.thumbSkeleton} />}
          {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed URL: next/image's optimizer/caching does not apply */}
          <img
            className={`${styles.thumb} ${isLoaded ? styles.thumbLoaded : ""}`}
            src={asset.url}
            alt={label}
            onLoad={() => setIsLoaded(true)}
          />
        </div>

        {(asset.original_filename || size) && (
          <div className={styles.meta}>
            {asset.original_filename && (
              <p className={styles.filename} title={asset.original_filename}>
                {asset.original_filename}
              </p>
            )}
            {size && <p className={styles.size}>{size}</p>}
          </div>
        )}
      </button>

      <div className={styles.menu}>
        <Menu label={`Opciones de ${label.toLowerCase()}`} items={items} />
      </div>

      {isRenaming && (
        <RenameAssetDialog asset={asset} onClose={() => setIsRenaming(false)} />
      )}

      {isDeleting && (
        <DeleteAssetButton
          assetId={asset.id}
          assetLabel={label}
          open
          onClose={() => setIsDeleting(false)}
        />
      )}

      {isPreviewOpen && (
        <AssetPreviewDialog
          asset={asset}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}
    </div>
  );
}
