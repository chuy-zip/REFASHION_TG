import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createClient as createSupabaseClient,
  getAuthenticatedUser,
} from "@/lib/supabase/server";
import { ClientDetailView } from "@/components/clients/ClientDetailView/ClientDetailView";
import { listClientMembers } from "@/lib/members";
import type { Client, ClientRole } from "@/lib/types";
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

  // Client row, this user's role on it, whether they are a global admin, and
  // the member list — in parallel. The role/admin flags decide which actions
  // the UI offers; RLS still enforces them regardless.
  const [clientResult, membershipResult, adminResult, membersResult] =
    await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("client_members")
        .select("role")
        .eq("client_id", id)
        .eq("user_id", user?.id ?? "")
        .maybeSingle(),
      supabase.rpc("is_global_admin"),
      listClientMembers(supabase, id),
    ]);

  if (!clientResult.data) notFound();

  const client = clientResult.data as Client;

  const clientRole = membershipResult.data?.role as ClientRole | undefined;
  const isAdmin = adminResult.data === true;
  // owner/editor may edit; only owner may delete or manage members. Admin
  // bypasses all three, matching the RLS helpers.
  const canEdit = isAdmin || clientRole === "owner" || clientRole === "editor";
  const canDelete = isAdmin || clientRole === "owner";

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/clients">
        Volver a clientes
      </Link>

      <ClientDetailView
        client={client}
        canEdit={canEdit}
        canDelete={canDelete}
        members={membersResult.members}
        canManageMembers={canDelete}
        currentUserId={user?.id ?? ""}
      />
    </main>
  );
}
