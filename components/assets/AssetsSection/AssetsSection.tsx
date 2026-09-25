"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetCard } from "@/components/assets/AssetCard/AssetCard";
import { ModelGenerator } from "@/components/designs/ModelGenerator/ModelGenerator";
import { Button } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { Icon } from "@/components/ui/Icon/Icon";
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
  /** True while the provider is the simulator: generating costs nothing. */
  isSimulated: boolean;
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
  isSimulated,
}: AssetsSectionProps) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
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
        {/* **Solo entre las fotos de modelo**, que es el único tipo que este
            sistema sabe dibujar. Ofrecerlo junto a las prendas o los logotipos
            sería prometer algo que no existe: una prenda generada no tiene de
            dónde salir, y un logotipo lo trae el cliente. */}
        {showUploadTile && selectedType === "model_photo" && (
          <button
            type="button"
            className={styles.generateTile}
            onClick={() => setGenerating(true)}
          >
            <Icon name="autoSelect" size={22} />
            <span className={styles.generateLabel}>Generar con IA</span>
          </button>
        )}
        {visibleAssets.map((asset) => (
          <AssetCard key={asset.id} asset={asset} canEdit={canManage} />
        ))}
      </ThumbnailGrid>

      <Dialog
        open={generating}
        onClose={() => setGenerating(false)}
        labelledBy="generar-modelo-title"
      >
        <div className={styles.dialog}>
          <h2 className={styles.dialogTitle} id="generar-modelo-title">
            Generar un modelo
          </h2>
          <ModelGenerator
            clientId={clientId}
            isSimulated={isSimulated}
            // Refresca la lista para que el modelo nuevo aparezca en la rejilla
            // de atrás sin cerrar el diálogo: quien está generando tres seguidos
            // no quiere reabrirlo cada vez.
            onGenerated={() => router.refresh()}
          />

          {/* Cerrar explícito. El `<dialog>` nativo se cierra con Esc y nada
              más: no reacciona al clic en el fondo, así que sin este botón la
              única salida era una tecla que no está escrita en ningún lado. */}
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => setGenerating(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
