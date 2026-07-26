import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { ClientDetailView } from "@/components/clients/ClientDetailView/ClientDetailView";
import { Icon } from "@/components/ui/Icon/Icon";
import { getClientAccess } from "@/lib/access";
import { listClientAssets } from "@/lib/assets";
import { listClientMembers } from "@/lib/members";
import { listClientProjects } from "@/lib/projects";
import type { Client } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ id: string }> };

/**
 * Client detail. Fetches the data and hands it to ClientDetailView, which owns
 * the tab UI. RLS hides clients the user is not a member of, so "no row" = 404.
 */
export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

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
      listClientProjects(supabase, id),
      listClientAssets(supabase, id),
    ]);

  if (!clientResult.data) notFound();

  const client = clientResult.data as Client;

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
        projects={projectsResult.projects}
        assets={assetsResult.assets}
        currentUserId={userId}
      />
    </main>
  );
}
