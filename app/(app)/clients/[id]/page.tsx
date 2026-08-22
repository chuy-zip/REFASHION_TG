import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { ClientDetailView } from "@/components/clients/ClientDetailView/ClientDetailView";
import { Icon } from "@/components/ui/Icon/Icon";
import { getClientAccess } from "@/lib/access";
import { listClientAssets } from "@/lib/assets-server";
import { getClientContents } from "@/lib/clients";
import { listClientMembers } from "@/lib/members";
import { listClientProjects, PROJECTS_PAGE_SIZE } from "@/lib/projects";
import { fetchProjectSamples } from "@/lib/designs-server";
import type { Client } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = {
  params: Promise<{ id: string }>;
  /** `?q=` filters and `?page=` walks the Proyectos tab, both server-side, so
      the images that tab resolves stay capped whatever the client holds. */
  searchParams: Promise<{ q?: string; page?: string }>;
};

/**
 * Client detail. Fetches the data and hands it to ClientDetailView, which owns
 * the tab UI. RLS hides clients the user is not a member of, so "no row" = 404.
 */
export default async function ClientDetailPage({
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
  const userId = user?.id ?? "";

  // Client row, the caller's access, members, projects and assets — in
  // parallel. The access flags decide which actions the UI offers; RLS
  // enforces them anyway.
  const [clientResult, access, membersResult, projectsResult, assetsResult] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      getClientAccess(supabase, id, userId),
      listClientMembers(supabase, id),
      listClientProjects(supabase, id, {
        query,
        page,
        pageSize: PROJECTS_PAGE_SIZE,
      }),
      listClientAssets(supabase, id),
    ]);

  if (!clientResult.data) notFound();

  const client = clientResult.data as Client;

  // What deleting this client would destroy, for its confirmation. Read here
  // rather than when the dialog opens: it is one row, and a delete warning that
  // arrives after the button is already pressable protects nobody.
  const contents = await getClientContents(supabase, id);

  // Depends on which projects came back, so it cannot join the batch above.
  // Bounded by it too: at most PROJECTS_PAGE_SIZE × PROJECT_SAMPLE_SIZE images.
  const samplesByProject = await fetchProjectSamples(
    supabase,
    projectsResult.projects.map((project) => project.id)
  );

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/clients">
        <Icon name="arrowBack" size={16} />
        Volver a clientes
      </Link>

      <ClientDetailView
        client={client}
        canEdit={access.canEdit}
        canDelete={access.canManage}
        members={membersResult.members}
        canManageMembers={access.canManage}
        contents={contents}
        projects={projectsResult.projects}
        projectsTotal={projectsResult.total}
        projectsPage={page}
        projectsQuery={query}
        samplesByProject={samplesByProject}
        assets={assetsResult.assets}
        currentUserId={userId}
      />
    </main>
  );
}
