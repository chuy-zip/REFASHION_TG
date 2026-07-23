import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/layout/AppHeader/AppHeader";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog/ClientFormDialog";
import { DeleteClientButton } from "@/components/clients/DeleteClientButton/DeleteClientButton";
import type { Client } from "@/lib/types";
import styles from "./page.module.css";

type PageProps = { params: Promise<{ id: string }> };

/**
 * Client detail. Projects and the asset catalog land here in later steps.
 * RLS hides clients the user is not a member of, so "no row" means 404.
 */
export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createSupabaseClient();
  const { data } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const client = data as Client;
  const details: Array<{ label: string; value: string | null }> = [
    { label: "NIT", value: client.nit },
    { label: "Ciudad", value: client.city },
    { label: "País", value: client.country },
    { label: "Dirección", value: client.address },
    { label: "Notas", value: client.notes },
  ];

  return (
    <>
      <AppHeader />
      <main className={styles.page}>
        <Link className={styles.back} href="/clients">
          Volver a clientes
        </Link>

        <div className={styles.titleRow}>
          <h1 className={styles.title}>{client.name}</h1>
          <div className={styles.actions}>
            <ClientFormDialog
              client={client}
              triggerLabel="Editar"
              triggerVariant="secondary"
            />
            <DeleteClientButton clientId={client.id} clientName={client.name} />
          </div>
        </div>

        <dl className={styles.details}>
          {details.map(({ label, value }) => (
            <div className={styles.detail} key={label}>
              <dt className={styles.label}>{label}</dt>
              <dd className={styles.value}>
                {value || <span className={styles.emptyValue}>Sin datos</span>}
              </dd>
            </div>
          ))}
        </dl>

        <p className={styles.placeholder}>
          Los proyectos y el catálogo de prendas de este cliente llegan en el
          siguiente paso.
        </p>
      </main>
    </>
  );
}
