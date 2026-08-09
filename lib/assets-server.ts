import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDownloadUrl, getReadUrl } from "@/lib/r2";
import { assetDisplayName, type AssetWithUrl } from "@/lib/assets";
import type { Asset } from "@/lib/types";

/**
 * Asset queries that sign R2 URLs. Split out of `lib/assets.ts` because that
 * file is imported by client components: pulling `lib/r2` (and the AWS SDK)
 * into their import graph only worked by grace of tree-shaking. The
 * `server-only` import above turns that from a hope into a build error.
 */

/**
 * Catalog assets of a client (client_id set, design_id null), newest first,
 * each with freshly-signed read/download URLs. RLS returns only what the user
 * may see.
 */
export async function listClientAssets(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ assets: AssetWithUrl[]; error: string | null }> {
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) return { assets: [], error: error.message };

  const assets = await Promise.all(
    (data as Asset[]).map(async (asset) => ({
      ...asset,
      url: await getReadUrl(asset.r2_key),
      downloadUrl: await getDownloadUrl(asset.r2_key, assetDisplayName(asset)),
    }))
  );

  return { assets, error: null };
}
