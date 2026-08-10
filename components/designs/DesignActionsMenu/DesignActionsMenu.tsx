"use client";

import { useState } from "react";
import { Menu, type MenuItem } from "@/components/ui/Menu/Menu";
import { DesignDataDialog } from "@/components/designs/DesignDataDialog/DesignDataDialog";
import { DeleteDesignButton } from "@/components/designs/DeleteDesignButton/DeleteDesignButton";
import type { Design } from "@/lib/types";

interface DesignActionsMenuProps {
  design: Design;
  /** owner/editor (or admin) of the parent client may edit and delete. */
  canEdit: boolean;
  /** Set from the design's own page, which cannot survive its deletion. */
  redirectOnDelete?: string;
}

/** Groups a design's edit and delete behind a gear menu. */
export function DesignActionsMenu({
  design,
  canEdit,
  redirectOnDelete,
}: DesignActionsMenuProps) {
  const [action, setAction] = useState<null | "edit" | "delete">(null);

  const items: MenuItem[] = [
    {
      // "Editar datos", not "Editar diseño": the design itself is edited on
      // /designs/[id]/edit, which the row now links to.
      label: "Editar datos",
      onSelect: () => setAction("edit"),
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite editar el diseño.",
    },
    {
      label: "Eliminar diseño",
      onSelect: () => setAction("delete"),
      danger: true,
      disabled: !canEdit,
      disabledReason: "Tu rol en este cliente no permite eliminar el diseño.",
    },
  ];

  return (
    <>
      <Menu label="Opciones del diseño" header={design.name} items={items} />

      {action === "edit" && (
        <DesignDataDialog
          design={design}
          open
          onClose={() => setAction(null)}
        />
      )}

      {action === "delete" && (
        <DeleteDesignButton
          designId={design.id}
          designName={design.name}
          redirectTo={redirectOnDelete}
          open
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
