import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getClientAccess } from "@/lib/access";
import { listProjectDesignsWithPreview } from "@/lib/designs-server";
import { DESIGNS_PAGE_SIZE } from "@/lib/designs";
import { getProjectContents } from "@/lib/projects";
import { ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu/ProjectActionsMenu";
import { Badge } from "@/components/ui/Badge/Badge";
import { PROJECT_STATUS_COPY } from "@/lib/projects";
import { DesignsSection } from "@/components/designs/DesignsSection/DesignsSection";
import { Icon } from "@/components/ui/Icon/Icon";
import type { Client, Project } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ id: string }>;
  /** `?q=` filters the design list, `?page=` walks it. Both are server-side. */
  searchParams: Promise<{ q?: string; page?: string }>;
};

/**
 * Project detail: its own fields plus the Designs section.
 * RLS hides projects whose client the user cannot see, so "no row" means 404.
 */
export default async function ProjectDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { q, page: rawPage } = await searchParams;

  const query = q?.trim() ?? "";
  // A hand-edited ?page=abc or ?page=-3 falls back to the first page rather
  // than reaching the query with a negative range.
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);

  const supabase = await createSupabaseClient();
  const user = await getAuthenticatedUser();

  const { data: projectData } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!projectData) notFound();
  const project = projectData as Project;

  // Parent client name (for the breadcrumb), this user's edit rights on it, and
  // the project's designs *with* a preview each. The catalog is deliberately
  // NOT fetched here: only the "Crear diseño" wizard needs it, and it loads it
  // when opened, so a page view no longer signs a URL per catalog image just in
  // case.
  const [{ data: clientData }, access, { designs, total }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("id", project.client_id)
      .maybeSingle(),
    getClientAccess(supabase, project.client_id, user?.id ?? ""),
    listProjectDesignsWithPreview(supabase, project.id, {
      query,
      page,
      pageSize: DESIGNS_PAGE_SIZE,
    }),
  ]);

  const client = clientData as Pick<Client, "id" | "name"> | null;

  // What deleting this project would destroy, for its confirmation.
  const contents = await getProjectContents(supabase, project.id);

  return (
    <main className={styles.page}>
      <Link className={styles.back} href={`/clients/${project.client_id}`}>
        <Icon name="arrowBack" size={16} />
        {client?.name ?? "Volver al cliente"}
      </Link>

      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{project.name}</h1>
          <Badge tone={PROJECT_STATUS_COPY[project.status].tone}>
            {PROJECT_STATUS_COPY[project.status].label}
          </Badge>
        </div>
        {access.canEdit && (
          <ProjectActionsMenu
            project={project}
            canEdit={access.canEdit}
            contents={contents}
          />
        )}
      </div>

      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}

      <DesignsSection
        clientId={project.client_id}
        projectId={project.id}
        designs={designs}
        total={total}
        page={page}
        query={query}
        canManage={access.canEdit}
      />
    </main>
  );
}
