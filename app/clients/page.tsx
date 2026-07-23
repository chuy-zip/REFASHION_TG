import Link from "next/link";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/AppHeader/AppHeader";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog/ClientFormDialog";
import type { Client } from "@/lib/types";
import styles from "./page.module.css";

/**
 * Client list.
 *
 * Reads Supabase directly: this is a Server Component, so the query runs on the
 * server under the same RLS as the API would apply. Writes still go through
 * /api/clients — see CreateClientForm.
 */
export default async function ClientsPage() {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name", { ascending: true });

  // In dev, surface the real Postgres/PostgREST reason in the terminal.
  // An empty list and a blocked query look identical in the UI otherwise.
  if (process.env.NODE_ENV === "development") {
    if (error) {
      console.error("[clients] select failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    } else {
      console.log(`[clients] select ok: ${data?.length ?? 0} fila(s)`);
    }
  }

  const clients = (data ?? []) as Client[];

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Clientes</h1>
          <ClientFormDialog triggerLabel="Crear cliente" />
        </div>

        {error && (
          <p className={styles.error} role="alert">
            No se pudieron cargar los clientes. Recarga la página para
            reintentar.
          </p>
        )}

        {!error && clients.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Sin clientes aún</p>
            <p className={styles.emptyHint}>
              Los clientes agrupan los proyectos y el catálogo de prendas.
            </p>
          </div>
        )}

        {clients.length > 0 && (
          <ul className={styles.list}>
            {clients.map((client) => (
              <li key={client.id}>
                <Link className={styles.card} href={`/clients/${client.id}`}>
                  <span className={styles.cardName}>{client.name}</span>
                  <span className={styles.cardMeta}>
                    {[client.city, client.nit].filter(Boolean).join(" · ") ||
                      "Sin datos adicionales"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
