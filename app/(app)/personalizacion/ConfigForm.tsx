"use client";

import { useActionState, useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { saveAgentConfig, type SaveResult } from "./actions";
import type { Service } from "@/lib/agent/config";

const empty: SaveResult = {};

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Lunes" },
  { key: "tue", label: "Martes" },
  { key: "wed", label: "Miércoles" },
  { key: "thu", label: "Jueves" },
  { key: "fri", label: "Viernes" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

interface Props {
  initial: {
    system_prompt: string;
    tone: string;
    handoff_message: string;
    collect_new_patient: boolean;
    business_info: Record<string, string>;
    services: Service[];
    business_hours: Record<string, { start: string; end: string }[]>;
  };
}

export function ConfigForm({ initial }: Props) {
  const [state, action, pending] = useActionState(saveAgentConfig, empty);
  const [services, setServices] = useState<Service[]>(
    initial.services.length ? initial.services : [{ name: "", duration_minutes: 30 }],
  );

  return (
    <form action={action} className="space-y-6">
      {/* Prompt */}
      <Card title="Prompt del sistema" desc="La instrucción base del agente. Se combina con el tono, los servicios y los horarios en cada respuesta.">
        <textarea
          name="system_prompt"
          defaultValue={initial.system_prompt}
          rows={6}
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </Card>

      {/* Tono + handoff + nuevo paciente */}
      <Card title="Comportamiento">
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField name="tone" label="Tono de voz" defaultValue={initial.tone} />
          <TextField
            name="handoff_message"
            label="Mensaje al derivar a un humano"
            defaultValue={initial.handoff_message}
          />
        </div>
        <label className="flex items-center gap-2 mt-4 text-sm">
          <input
            type="checkbox"
            name="collect_new_patient"
            defaultChecked={initial.collect_new_patient}
          />
          Preguntar si es paciente nuevo al agendar
        </label>
      </Card>

      {/* Info del negocio */}
      <Card title="Información del negocio">
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField name="info_direccion" label="Dirección" defaultValue={initial.business_info.direccion ?? ""} />
          <TextField name="info_telefono" label="Teléfono" defaultValue={initial.business_info.telefono ?? ""} />
        </div>
        <div className="mt-4 grid gap-4">
          <TextAreaField name="info_faq" label="Preguntas frecuentes" defaultValue={initial.business_info.faq ?? ""} />
          <TextAreaField name="info_cancelacion" label="Política de cancelación" defaultValue={initial.business_info.cancellation_policy ?? ""} />
        </div>
      </Card>

      {/* Servicios */}
      <Card title="Servicios" desc="El agente solo ofrece estos servicios.">
        <div className="space-y-3">
          {services.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <input
                name="service_name"
                defaultValue={s.name}
                placeholder="Nombre"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                name="service_duration"
                type="number"
                min={5}
                step={5}
                defaultValue={s.duration_minutes}
                placeholder="min"
                className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                name="service_desc"
                defaultValue={s.description ?? ""}
                placeholder="Descripción (opcional)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setServices((prev) => prev.filter((_, j) => j !== i))}
                className="p-2 text-muted hover:text-red-500"
                aria-label="Eliminar servicio"
              >
                <Trash size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setServices((prev) => [...prev, { name: "", duration_minutes: 30 }])
          }
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary"
        >
          <Plus size={16} /> Añadir servicio
        </button>
      </Card>

      {/* Horarios */}
      <Card title="Horario de atención" desc="El agente solo ofrece huecos dentro de este horario.">
        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const range = initial.business_hours[key]?.[0];
            const closed = !range;
            return (
              <div key={key} className="flex items-center gap-3 text-sm">
                <span className="w-24">{label}</span>
                <label className="flex items-center gap-1 text-muted">
                  <input type="checkbox" name={`closed_${key}`} defaultChecked={closed} />
                  Cerrado
                </label>
                <input
                  type="time"
                  name={`hours_${key}_start`}
                  defaultValue={range?.start ?? "09:00"}
                  className="rounded-lg border border-border bg-background px-2 py-1 outline-none focus:border-primary"
                />
                <span>—</span>
                <input
                  type="time"
                  name={`hours_${key}_end`}
                  defaultValue={range?.end ?? "18:00"}
                  className="rounded-lg border border-border bg-background px-2 py-1 outline-none focus:border-primary"
                />
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary text-primary-foreground px-5 py-2.5 font-medium disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        {state.error && <span className="text-sm text-red-500">{state.error}</span>}
        {state.message && <span className="text-sm text-primary">{state.message}</span>}
      </div>
    </form>
  );
}

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="text-sm text-muted mt-0.5 mb-3">{desc}</p>}
      {!desc && <div className="mb-3" />}
      {children}
    </section>
  );
}

function TextField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm block">
      <span className="block mb-1">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
      />
    </label>
  );
}

function TextAreaField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm block">
      <span className="block mb-1">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={2}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
      />
    </label>
  );
}
