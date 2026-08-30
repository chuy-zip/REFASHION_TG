"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton/Skeleton";
import type { AssetWithUrl } from "@/lib/assets";
import type { WorkStep } from "@/components/designs/StepStrip/StepStrip";
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
  /** Whose catalog the logos come from, and where new ones are written. */
  clientId: string;
  workingImageUrl: string | null;
  workingAssetId: string | null;
  logos: AssetWithUrl[];
  initialLayers: WorkspaceLayer[];
  /** Where the working image has been, oldest first. */
  steps: WorkStep[];
  currentAssetId: string | null;
  canEdit: boolean;
}

export function DesignWorkspaceLoader(props: DesignWorkspaceLoaderProps) {
  return <DesignWorkspace {...props} />;
}
