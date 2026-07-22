"use client";

import { useActionState } from "react";
import { createOrganization, type OnboardingState } from "./actions";

const initial: OnboardingState = {};

// Lista corta de timezones comunes en LatAm/España. El usuario puede cambiarla luego.
const TIMEZONES = [
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/New_York",
  "Europe/Madrid",
];

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createOrganization,
    initial,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm mb-1">
          Nombre del negocio
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Clínica Dental Sonrisa"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="full_name" className="block text-sm mb-1">
          Tu nombre <span className="text-muted">(opcional)</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
        />
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm mb-1">
          Zona horaria
        </label>
        <select
          id="timezone"
          name="timezone"
          defaultValue="America/Mexico_City"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:border-primary"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 font-medium disabled:opacity-60"
      >
        {pending ? "Creando…" : "Crear negocio y continuar"}
      </button>
    </form>
  );
}
