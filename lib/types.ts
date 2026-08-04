/**
 * Domain types mirroring the database schema.
 *
 * Source of truth: docs/001_initial_schema.sql and docs/002_granular_rls_policies.sql
 * Keep these in sync whenever a migration changes a table.
 */

/**
 * Global role in the system (public.roles.name).
 * Stored on profiles.role_id. Not what guards the data — see ClientRole.
 */
export type GlobalRole = "admin" | "editor" | "viewer";

/**
 * Role on a SPECIFIC client (client_members.role).
 * This is the one RLS actually enforces. There is no owner_id anywhere:
 * access exists if and only if a client_members row exists.
 */
export type ClientRole = "owner" | "editor" | "viewer";

export type ProjectStatus = "draft" | "active" | "closed";

/**
 * Where a design sits in its session. Unlike `version` this is not derived:
 * it records the user's intent ("I consider this finished"), which the
 * design's assets cannot tell us. See migration 011.
 */
export type DesignStatus = "draft" | "active" | "completed";

export type AssetOrigin = "upload" | "generated";

/** Assets hanging directly off a client — the catalog. */
export type ClientAssetType =
  | "logo"
  | "base_garment"
  | "model_photo"
  | "tech_drawing";

/** Assets produced against a design — masks and AI results. */
export type DesignAssetType =
  | "mask"
  | "composition"
  | "inpainting"
  | "vton"
  | "ai_model"
  | "export_flat"
  | "export_model"
  | "export_ai";

/** Must match the assets_type_check constraint exactly. */
export type AssetType = ClientAssetType | DesignAssetType;

export interface Role {
  id: number;
  name: GlobalRole;
  description: string | null;
}

export interface Profile {
  id: string;
  /** Copied from auth.users by trigger, so it can be searched under RLS. */
  email: string | null;
  first_name: string;
  last_name: string;
  role_id: number;
  created_at: string;
  updated_at: string;
}

/** A profile with its global role resolved — what the user screens list. */
export interface UserSummary {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  role_id: number;
  role_name: GlobalRole;
}

export interface Client {
  id: string;
  name: string;
  nit: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientMember {
  client_id: string;
  user_id: string;
  role: ClientRole;
  created_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface Design {
  id: string;
  project_id: string;
  name: string;
  garment_type: string;
  /**
   * Derived, never typed by hand: 1 for a new design, parent.version + 1 for
   * an iteration. See parent_design_id.
   */
  version: number;
  status: DesignStatus;
  /** The catalog image this design starts from. Null when it has none. */
  base_asset_id: string | null;
  /**
   * The design this one iterates on (v1 -> v2). Traces design-level lineage;
   * assets.parent_asset_id traces image-level lineage. Both exist on purpose.
   */
  parent_design_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  /** Set for catalog assets, null for design-level ones. */
  client_id: string | null;
  /** Set for design-level assets, null for catalog ones. */
  design_id: string | null;
  asset_type: AssetType;
  /**
   * The object key inside the R2 bucket — not a URL, and not the binary.
   * The bucket is private; read URLs are presigned on demand from this key.
   */
  r2_key: string;
  /** The file name the user picked at upload time — display/search only, never used as the R2 key. Null for assets uploaded before migration 008. */
  original_filename: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  origin: AssetOrigin;
  runware_task_id: string | null;
  cost_usd: number | null;
  generation_prompt: string | null;
  /** Traces the iteration chain back to the source asset. */
  parent_asset_id: string | null;
  created_at: string;
}

/** Shape every failing Route Handler returns. Message is user-facing Spanish. */
export interface ApiError {
  error: string;
}
