"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login, signup, type AuthState } from "./actions";

const initial: AuthState = {};

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState(action, initial);
  const redirect = useSearchParams().get("redirect") ?? "/dashboard";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirect" value={redirect} />

      <div>
        <label htmlFor="email" className="block text-sm mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm mb-1">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
        />
        {mode === "signup" && (
          <p className="mt-1 text-xs text-muted">Mínimo 8 caracteres.</p>
        )}
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.message && (
        <p className="text-sm text-primary">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium disabled:opacity-60"
      >
        {pending
          ? "Un momento…"
          : mode === "login"
            ? "Iniciar sesión"
            : "Crear cuenta"}
      </button>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            ¿No tienes cuenta?{" "}
            <Link href="/signup" className="text-primary">
              Regístrate
            </Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-primary">
              Inicia sesión
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
