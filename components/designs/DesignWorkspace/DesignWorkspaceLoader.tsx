"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import type { AssetWithUrl } from "@/lib/assets";
import type { WorkspaceLayer } from "./DesignWorkspace";
import styles from "./DesignWorkspace.module.css";

/**
 * Client boundary for the canvas.
 *
 * Konva draws onto a real `<canvas>` and reaches for `window`, so it cannot be
 * server-rendered. `ssr: false` is only allowed inside a Client Component,
 * which is the only reason this thin wrapper exists — the page itself stays a
 * Server Component and keeps reading its data directly from Postgres.
 */
const DesignWorkspace = dynamic(
  () => import("./DesignWorkspace").then((module) => module.DesignWorkspace),
  {
    ssr: false,
    loading: () => <Skeleton className={styles.loadingBox} />,
  }
);

interface DesignWorkspaceLoaderProps {
  designId: string;
  designName: string;
  workingImageUrl: string | null;
  workingAssetId: string | null;
  logos: AssetWithUrl[];
  initialLayers: WorkspaceLayer[];
  canEdit: boolean;
}

export function DesignWorkspaceLoader(props: DesignWorkspaceLoaderProps) {
  return <DesignWorkspace {...props} />;
}
