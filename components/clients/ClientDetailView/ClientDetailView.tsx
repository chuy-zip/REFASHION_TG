"use client";

import { useState } from "react";
import { ClientActionsMenu } from "@/components/clients/ClientActionsMenu/ClientActionsMenu";
import { MembersSection } from "@/components/clients/MembersSection/MembersSection";
import { ProjectsSection } from "@/components/projects/ProjectsSection/ProjectsSection";
import type { ClientMemberView } from "@/lib/members";
import type { Client, Project } from "@/lib/types";
import styles from "./ClientDetailView.module.css";

type Tab = "info" | "members" | "projects";

const TABS: { id: Tab; label: string }[] = [
  { id: "info", label: "Información" },
  { id: "members", label: "Miembros" },
  { id: "projects", label: "Proyectos" },
];

interface ClientDetailViewProps {
  client: Client;
  canEdit: boolean;
  canDelete: boolean;
  members: ClientMemberView[];
  canManageMembers: boolean;
  projects: Project[];
  currentUserId: string;
}

/**
 * Tabbed detail for a client: a left sidebar switches between the client's own
 * fields, its members, and (later) its projects. Header actions stay visible
 * across tabs since they act on the client as a whole.
 */
export function ClientDetailView({
  client,
  canEdit,
  canDelete,
  members,
  canManageMembers,
  projects,
  currentUserId,
}: ClientDetailViewProps) {
  const [tab, setTab] = useState<Tab>("info");

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>{client.name}</h1>
        {(canEdit || canDelete) && (
          <ClientActionsMenu
            client={client}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        )}
      </div>

      <nav className={styles.tabs} aria-label="Secciones del cliente">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={styles.tab}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {tab === "info" && <InfoPanel client={client} />}

        {tab === "members" && (
          <MembersSection
            clientId={client.id}
            members={members}
            canManage={canManageMembers}
            currentUserId={currentUserId}
          />
        )}

        {tab === "projects" && (
          <ProjectsSection
            clientId={client.id}
            projects={projects}
            canManage={canEdit}
          />
        )}
      </div>
    </div>
  );
}

function InfoPanel({ client }: { client: Client }) {
  const details: { label: string; value: string | null }[] = [
    { label: "NIT", value: client.nit },
    { label: "Ciudad", value: client.city },
    { label: "País", value: client.country },
    { label: "Dirección", value: client.address },
    { label: "Notas", value: client.notes },
  ];

  return (
    <dl className={styles.details}>
      {details.map(({ label, value }) => (
        <div className={styles.detail} key={label}>
          <dt className={styles.detailLabel}>{label}</dt>
          <dd className={styles.detailValue}>
            {value || <span className={styles.emptyValue}>Sin datos</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
