"use client";

import { useState } from "react";
import { Menu, type MenuItem } from "@/components/ui/Menu/Menu";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog/ClientFormDialog";
import { DeleteClientButton } from "@/components/clients/DeleteClientButton/DeleteClientButton";
import type { ClientContents } from "@/lib/clients";
import type { Client } from "@/lib/types";

interface ClientActionsMenuProps {
  client: Client;
  canEdit: boolean;
  canDelete: boolean;
  /** What the delete confirmation will say disappears. */
  contents: ClientContents | null;
}

/**
 * Groups a client's edit and delete behind a gear menu, so the destructive
 * action is deliberate rather than a loose button. The dialogs mount only while
 * open (fresh state each time) and are driven by the menu selection.
 */
export function ClientActionsMenu({
  client,
  canEdit,
  canDelete,
  contents,
}: ClientActionsMenuProps) {
  const [action, setAction] = useState<null | "edit" | "delete">(null);

  const items: MenuItem[] = [
    {
      label: "Editar cliente",
      onSelect: () => setAction("edit"),
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite editarlo.",
    },
    {
      label: "Eliminar cliente",
      onSelect: () => setAction("delete"),
      danger: true,
      disabled: !canDelete,
      disabledReason: "Solo el owner del cliente puede eliminarlo.",
    },
  ];

  return (
    <>
      <Menu label="Opciones del cliente" header={client.name} items={items} />

      {action === "edit" && (
        <ClientFormDialog
          client={client}
          open
          onClose={() => setAction(null)}
        />
      )}

      {action === "delete" && (
        <DeleteClientButton
          clientId={client.id}
          clientName={client.name}
          contents={contents}
          open
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
