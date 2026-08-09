"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/ui/PasswordInput/PasswordInput";
import { POST_LOGIN_PATH } from "@/lib/routes";
import styles from "./login.module.css";

/**
 * Sign-in screen. Internal tool: there is no public signup and no password
 * reset — users are created by hand from the Supabase dashboard.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // In dev, surface the real Supabase reason in the browser console
      // (e.g. "Email not confirmed", "Invalid login credentials"). The UI stays
      // generic so production never reveals which emails exist.
      if (process.env.NODE_ENV === "development") {
        console.error("[login] signInWithPassword:", signInError.message);
      }
      setError("No se pudo iniciar sesión. Revisa el correo y la contraseña.");
      setIsSubmitting(false);
      return;
    }

    // refresh() re-runs the middleware so the new session cookies are picked up
    // before the new page renders.
    router.replace(POST_LOGIN_PATH);
    router.refresh();
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <header className={styles.header}>
          <h1 className={styles.title}>Refashion IA</h1>
          <p className={styles.subtitle}>Ingresa para continuar.</p>
        </header>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className={styles.input}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
            required
            disabled={isSubmitting}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Contraseña
          </label>
          <PasswordInput
            id="password"
            name="password"
            className={styles.input}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            disabled={isSubmitting}
          />
        </div>

        <button className={styles.submit} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
