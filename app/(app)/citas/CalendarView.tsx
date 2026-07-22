"use client";

import { useMemo, useState, useTransition } from "react";
import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { updateAppointmentStatus } from "./actions";

export interface Appointment {
  id: string;
  service: string;
  starts_at: string;
  ends_at: string;
  status: "confirmed" | "cancelled" | "completed";
  full_name: string;
  phone: string;
  is_new_patient: boolean | null;
  notes: string | null;
}

interface Props {
  appointments: Appointment[];
  timeZone: string;
}

const STATUS_STYLES: Record<Appointment["status"], string> = {
  confirmed: "bg-primary/15 text-primary",
  completed: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  cancelled: "bg-red-500/10 text-red-500 line-through",
};

const STATUS_LABEL: Record<Appointment["status"], string> = {
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};

export function CalendarView({ appointments, timeZone }: Props) {
  // Mes que se está viendo (primer día), en hora local del navegador; suficiente
  // para la navegación de la grilla. Las citas se ubican por su fecha en `timeZone`.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() }; // month 0-11
  });
  const [selected, setSelected] = useState<Appointment | null>(null);

  // Agrupa citas por día (YYYY-MM-DD en la timezone de la org).
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = dayKeyInTz(new Date(a.starts_at), timeZone);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return map;
  }, [appointments, timeZone]);

  const cells = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month),
    [cursor],
  );

  const monthLabel = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
  }).format(new Date(cursor.year, cursor.month, 1));

  const go = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  return (
    <div>
      {/* Navegación de mes */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => go(-1)}
          className="p-2 rounded-lg border border-border hover:bg-card"
          aria-label="Mes anterior"
        >
          <CaretLeft size={16} />
        </button>
        <span className="font-medium capitalize min-w-40 text-center">
          {monthLabel}
        </span>
        <button
          onClick={() => go(1)}
          className="p-2 rounded-lg border border-border hover:bg-card"
          aria-label="Mes siguiente"
        >
          <CaretRight size={16} />
        </button>
      </div>

      {/* Grilla */}
      <div className="grid grid-cols-7 gap-px bg-border border border-border rounded-lg overflow-hidden">
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
          <div
            key={d}
            className="bg-card px-2 py-1.5 text-xs font-medium text-muted text-center"
          >
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          const key = cell
            ? `${cursor.year}-${pad(cursor.month + 1)}-${pad(cell)}`
            : `empty-${i}`;
          const dayAppts = cell ? (byDay.get(key) ?? []) : [];
          return (
            <div
              key={key}
              className={`bg-background min-h-24 p-1.5 ${cell ? "" : "opacity-40"}`}
            >
              {cell && (
                <>
                  <span className="text-xs text-muted">{cell}</span>
                  <div className="mt-1 space-y-1">
                    {dayAppts
                      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                      .map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setSelected(a)}
                          className={`block w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] ${STATUS_STYLES[a.status]}`}
                        >
                          {timeInTz(new Date(a.starts_at), timeZone)} {a.full_name}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <DetailModal
          appointment={selected}
          timeZone={timeZone}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function DetailModal({
  appointment,
  timeZone,
  onClose,
}: {
  appointment: Appointment;
  timeZone: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(appointment.status);
  const [error, setError] = useState<string | null>(null);

  const when = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(appointment.starts_at));

  const change = (next: "cancelled" | "completed") => {
    setError(null);
    startTransition(async () => {
      const res = await updateAppointmentStatus(appointment.id, next);
      if (res.error) setError(res.error);
      else setStatus(next);
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-card border border-border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold capitalize">
            {appointment.service}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted">
            <X size={18} />
          </button>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Cliente" value={appointment.full_name} />
          <Row label="Teléfono" value={appointment.phone} />
          <Row label="Cuándo" value={when} />
          {appointment.is_new_patient != null && (
            <Row
              label="Paciente nuevo"
              value={appointment.is_new_patient ? "Sí" : "No"}
            />
          )}
          <Row label="Estado" value={STATUS_LABEL[status]} />
          {appointment.notes && <Row label="Notas" value={appointment.notes} />}
        </dl>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        {status === "confirmed" && (
          <div className="mt-5 flex gap-2">
            <button
              disabled={pending}
              onClick={() => change("completed")}
              className="flex-1 rounded-lg border border-border py-2 text-sm disabled:opacity-60"
            >
              Marcar completada
            </button>
            <button
              disabled={pending}
              onClick={() => change("cancelled")}
              className="flex-1 rounded-lg bg-red-500/10 text-red-500 py-2 text-sm disabled:opacity-60"
            >
              Cancelar cita
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

// ── helpers de fecha ──
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Matriz de celdas del mes: null para huecos antes del día 1 / después del último. */
function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dayKeyInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // en-CA → YYYY-MM-DD
  return parts;
}

function timeInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
