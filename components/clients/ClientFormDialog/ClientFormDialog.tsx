"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button/Button";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { useToast } from "@/components/ui/Toast/ToastProvider";
import { apiPatch, apiPost } from "@/lib/api-client";
import type { Client } from "@/lib/types";
import styles from "./ClientFormDialog.module.css";

interface ClientFormDialogProps {
  /** Present => edit that client (PATCH). Absent => create a new one (POST). */
  client?: Client;
  triggerLabel: string;
  triggerVariant?: ButtonVariant;
  /** When set, the trigger is disabled and shows this reason on hover. */
  disabled?: boolean;
  disabledReason?: string;
}

type FormState = {
  name: string;
  nit: string;
  city: string;
  country: string;
  address: string;
  notes: string;
};

function initialState(client?: Client): FormState {
  return {
    name: client?.name ?? "",
    nit: client?.nit ?? "",
    city: client?.city ?? "",
    country: client?.country ?? "Guatemala",
    address: client?.address ?? "",
    notes: client?.notes ?? "",
  };
}

/**
 * Create/edit form for a client. Both modes share every field, so they share
 * one component; only the HTTP verb and the copy differ.
 *
 * Writes always go through /api/clients — never straight to Supabase.
 */
export function ClientFormDialog({
  client,
  triggerLabel,
  triggerVariant = "primary",
  disabled = false,
  disabledReason,
}: ClientFormDialogProps) {
  const router = useRouter();
  const { notify } = useToast();
  const isEdit = client !== undefined;

  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialState(client));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function open() {
    setForm(initialState(client));
    setError(null);
    setIsOpen(true);
  }

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const body = {
      name: form.name,
      // Empty inputs become null so the column stays NULL, never "".
      nit: form.nit.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };

    const result = isEdit
      ? await apiPatch(`/api/clients/${client.id}`, body)
      : await apiPost("/api/clients", body);

    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsOpen(false);
    notify({
      type: "success",
      message: isEdit ? "Cliente actualizado." : "Cliente creado.",
    });
    // Re-runs the server component so the list/detail shows the new data.
    router.refresh();
  }

  const titleId = isEdit ? `edit-client-${client.id}` : "create-client";

  return (
    <>
      <Button
        variant={triggerVariant}
        onClick={open}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
      >
        {triggerLabel}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        labelledBy={titleId}
      >
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <h2 className={styles.title} id={titleId}>
            {isEdit ? "Editar cliente" : "Nuevo cliente"}
          </h2>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${titleId}-name`}>
              Nombre
            </label>
            <input
              id={`${titleId}-name`}
              className={styles.input}
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              autoFocus
              required
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${titleId}-nit`}>
                NIT <span className={styles.optional}>(opcional)</span>
              </label>
              <input
                id={`${titleId}-nit`}
                className={styles.input}
                value={form.nit}
                onChange={(event) => setField("nit", event.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor={`${titleId}-city`}>
                Ciudad <span className={styles.optional}>(opcional)</span>
              </label>
              <input
                id={`${titleId}-city`}
                className={styles.input}
                value={form.city}
                onChange={(event) => setField("city", event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${titleId}-country`}>
              País <span className={styles.optional}>(opcional)</span>
            </label>
            <input
              id={`${titleId}-country`}
              className={styles.input}
              value={form.country}
              onChange={(event) => setField("country", event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${titleId}-address`}>
              Dirección <span className={styles.optional}>(opcional)</span>
            </label>
            <input
              id={`${titleId}-address`}
              className={styles.input}
              value={form.address}
              onChange={(event) => setField("address", event.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${titleId}-notes`}>
              Notas <span className={styles.optional}>(opcional)</span>
            </label>
            <textarea
              id={`${titleId}-notes`}
              className={styles.textarea}
              value={form.notes}
              onChange={(event) => setField("notes", event.target.value)}
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || form.name.trim().length === 0}
            >
              {isSubmitting ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
