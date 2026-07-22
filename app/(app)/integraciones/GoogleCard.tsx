"use client";

import { useActionState } from "react";
import { CheckCircle, GoogleLogo } from "@phosphor-icons/react";
import { connectGoogle, saveCalendarId } from "./google-actions";
import type { ActionResult } from "./actions";
import type { CalendarOption } from "@/lib/google/calendar";

const empty: ActionResult = {};

interface Props {
  connected: boolean;
  currentCalendarId: string | null;
  calendars: CalendarOption[];
  loadError: string | null;
}

export function GoogleCard({
  connected,
  currentCalendarId,
  calendars,
  loadError,
}: Props) {
  const [state, action, saving] = useActionState(saveCalendarId, empty);

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-semibold text-lg">Google Calendar</h2>
      <p className="text-sm text-muted mt-1">
        El agente consulta tu disponibilidad y crea los eventos de las citas aquí.
      </p>

      {!connected ? (
        <form action={connectGoogle} className="mt-4">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 font-medium hover:bg-background"
          >
            <GoogleLogo size={18} weight="bold" />
            Conectar con Google
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="inline-flex items-center gap-2 text-sm text-primary">
            <CheckCircle size={18} weight="fill" /> Conectado
          </p>

          {loadError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              No pude listar tus calendarios: {loadError}
            </p>
          ) : (
            <form action={action} className="flex items-end gap-3">
              <label className="text-sm flex-1 max-w-sm">
                <span className="block mb-1">Calendario a usar</span>
                <select
                  name="calendar_id"
                  defaultValue={currentCalendarId ?? "primary"}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                >
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary}
                      {c.primary ? " (principal)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </form>
          )}

          <form action={connectGoogle}>
            <button
              type="submit"
              className="text-sm text-muted underline hover:text-foreground"
            >
              Reconectar / cambiar de cuenta
            </button>
          </form>
        </div>
      )}

      {state.error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.message && <p className="mt-3 text-sm text-primary">{state.message}</p>}
    </section>
  );
}
