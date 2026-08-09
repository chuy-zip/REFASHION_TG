import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { getClientAccess } from "@/lib/access";
import { listProjectDesigns } from "@/lib/designs";
import { ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu/ProjectActionsMenu";
import { Badge } from "@/components/ui/Badge/Badge";
import { PROJECT_STATUS_COPY } from "@/lib/projects";
import { DesignsSection } from "@/components/designs/DesignsSection/DesignsSection";
import { Icon } from "@/components/ui/Icon/Icon";
import type { Client, Project } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ id: string }> };

/**
 * Project detail: its own fields plus the Designs section.
 * RLS hides projects whose client the user cannot see, so "no row" means 404.
 */
export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;

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
  // the project's designs. The catalog is deliberately NOT fetched here: only
  // the "Crear diseño" wizard needs it, and it loads it when opened, so a page
  // view no longer signs a URL per catalog image just in case.
  const [{ data: clientData }, access, { designs }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("id", project.client_id)
      .maybeSingle(),
    getClientAccess(supabase, project.client_id, user?.id ?? ""),
    listProjectDesigns(supabase, project.id),
  ]);

  const client = clientData as Pick<Client, "id" | "name"> | null;

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
          <ProjectActionsMenu project={project} canEdit={access.canEdit} />
        )}
      </div>

      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}

      <DesignsSection
        clientId={project.client_id}
        projectId={project.id}
        designs={designs}
        canManage={access.canEdit}
      />
    </main>
  );
}
