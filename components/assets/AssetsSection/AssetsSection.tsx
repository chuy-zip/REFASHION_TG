"use client";

import { useMemo, useState } from "react";
import { AssetCard } from "@/components/assets/AssetCard/AssetCard";
import { AssetUploadTile } from "@/components/assets/AssetUploadTile/AssetUploadTile";
import { PillTabs } from "@/components/ui/PillTabs/PillTabs";
import { SearchInput } from "@/components/ui/SearchInput/SearchInput";
import { ThumbnailGrid } from "@/components/ui/ThumbnailGrid/ThumbnailGrid";
import { ASSET_TYPE_COPY, CLIENT_ASSET_TYPES, type AssetWithUrl } from "@/lib/assets";
import type { ClientAssetType } from "@/lib/types";
import styles from "./AssetsSection.module.css";

interface AssetsSectionProps {
  clientId: string;
  assets: AssetWithUrl[];
  /** owner/editor (or admin) may upload and delete. */
  canManage: boolean;
}

/**
 * Client-level catalog: prendas base, logotipos, modelos, dibujos técnicos.
 * Breaks from the row-list pattern used everywhere else on purpose — these are
 * images, and the image is the protagonist (STYLE_GUIDE §1). A pill per type
 * filters a grid of thumbnails instead of mixing all four types in one list.
 */
export function AssetsSection({
  clientId,
  assets,
  canManage,
}: AssetsSectionProps) {
  const [selectedType, setSelectedType] = useState<ClientAssetType>(
    CLIENT_ASSET_TYPES[0]
  );
  const [query, setQuery] = useState("");

  function selectType(type: ClientAssetType) {
    setSelectedType(type);
    // A query from the previous type would otherwise silently carry over and
    // make the new grid look emptier than it is, with no visible reason why.
    setQuery("");
  }

  const countByType = useMemo(() => {
    const counts: Partial<Record<ClientAssetType, number>> = {};
    for (const asset of assets) {
      const type = asset.asset_type as ClientAssetType;
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }, [assets]);

  const assetsOfType = assets.filter(
    (asset) => asset.asset_type === selectedType
  );
  const trimmedQuery = query.trim().toLowerCase();
  const visibleAssets = trimmedQuery
    ? assetsOfType.filter((asset) =>
        (asset.original_filename ?? "").toLowerCase().includes(trimmedQuery)
      )
    : assetsOfType;
  const copy = ASSET_TYPE_COPY[selectedType];

  // Hidden while searching: a tile sitting first among the results would read
  // as one of them, and "upload" is not an answer to a query.
  const showUploadTile = canManage && !trimmedQuery;

  return (
    <section>
      <div className={styles.toolbar}>
        <PillTabs
          label="Tipo de recurso"
          selected={selectedType}
          onSelect={(key) => selectType(key as ClientAssetType)}
          options={CLIENT_ASSET_TYPES.map((type) => ({
            key: type,
            label: ASSET_TYPE_COPY[type].labelPlural,
            count: countByType[type] ?? 0,
          }))}
        />

        {assetsOfType.length > 0 && (
          <SearchInput
            value={query}
            onChange={setQuery}
            scope={copy.labelPlural.toLowerCase()}
          />
        )}
      </div>

      <ThumbnailGrid
        size="lg"
        isEmpty={visibleAssets.length === 0 && !showUploadTile}
        emptyTitle={
          trimmedQuery
            ? `No se encontraron resultados para "${query.trim()}".`
            : copy.empty
        }
      >
        {showUploadTile && (
          <AssetUploadTile clientId={clientId} assetType={selectedType} />
        )}
        {visibleAssets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} canEdit={canManage} />
        ))}
      </ThumbnailGrid>
    </section>
  );
}
