// ============================================================================
// Tools del agente (AI SDK 6). Se construyen por invocación con un contexto
// cerrado (organización, conversación, contacto, teléfono) para que cada tool
// actúe sobre los datos correctos sin que el modelo pueda cambiar de tenant.
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import {
  findAvailableSlots,
  createCalendarEvent,
} from "@/lib/google/calendar";
import { parseServices, type Service } from "@/lib/agent/config";
import type { Tables, TablesUpdate } from "@/lib/database.types";

export interface ToolContext {
  organization: Tables<"organizations">;
  agentConfig: Tables<"agent_configs">;
  conversationId: string;
  contactId: string;
  fromPhone: string;
  /** Se marca true si el agente pidió handoff, para que el runner lo comunique. */
  handoffRequested: { value: boolean };
}

function findService(services: Service[], name: string): Service | undefined {
  const target = name.trim().toLowerCase();
  return (
    services.find((s) => s.name.toLowerCase() === target) ??
    services.find((s) => s.name.toLowerCase().includes(target)) ??
    services.find((s) => target.includes(s.name.toLowerCase()))
  );
}

export function buildTools(ctx: ToolContext) {
  const supabase = createAdminClient();
  const services = parseServices(ctx.agentConfig.services);

  return {
    // ── get_available_slots ──
    get_available_slots: tool({
      description:
        "Devuelve 3 huecos libres reales para un servicio en los próximos días, respetando el horario de atención y el calendario. Úsalo siempre antes de ofrecer horarios; nunca inventes.",
      inputSchema: z.object({
        service: z.string().describe("Nombre del servicio, tal como lo pidió el cliente."),
        days_ahead: z
          .number()
          .int()
          .min(1)
          .max(30)
          .optional()
          .describe("Ventana de búsqueda en días (por defecto 7)."),
      }),
      execute: async ({ service, days_ahead }) => {
        const svc = findService(services, service);
        if (!svc) {
          return {
            ok: false,
            error: `No ofrecemos "${service}". Servicios: ${services.map((s) => s.name).join(", ")}.`,
          };
        }

        // Calendar config de la organización.
        const { data: gc } = await supabase
          .from("google_calendar_configs")
          .select("calendar_id")
          .eq("organization_id", ctx.organization.id)
          .maybeSingle();
        if (!gc) {
          return { ok: false, error: "El calendario aún no está conectado." };
        }

        try {
          const slots = await findAvailableSlots({
            organizationId: ctx.organization.id,
            calendarId: gc.calendar_id,
            timeZone: ctx.organization.timezone,
            businessHours: ctx.agentConfig.business_hours as Record<
              string,
              { start: string; end: string }[]
            >,
            durationMinutes: svc.duration_minutes,
            daysAhead: days_ahead ?? 7,
            limit: 3,
          });
          if (slots.length === 0) {
            return { ok: false, error: "No encontré huecos libres en ese periodo." };
          }
          return { ok: true, service: svc.name, slots };
        } catch (e) {
          log("tool.get_available_slots_error", {
            organization_id: ctx.organization.id,
            error: (e as Error).message,
          });
          return { ok: false, error: "No pude consultar el calendario ahora mismo." };
        }
      },
    }),

    // ── book_appointment ──
    book_appointment: tool({
      description:
        "Agenda la cita: crea el evento en el calendario y la guarda. Úsalo solo cuando tengas nombre, servicio y un horario confirmado por el cliente que venga de get_available_slots.",
      inputSchema: z.object({
        full_name: z.string().describe("Nombre completo del cliente."),
        service: z.string().describe("Servicio elegido."),
        starts_at: z
          .string()
          .describe("Inicio de la cita en ISO 8601 UTC, exactamente el starts_at de un slot ofrecido."),
        is_new_patient: z
          .boolean()
          .optional()
          .describe("Si es paciente nuevo (cuando aplique al negocio)."),
      }),
      execute: async ({ full_name, service, starts_at, is_new_patient }) => {
        const svc = findService(services, service);
        if (!svc) return { ok: false, error: `Servicio "${service}" no válido.` };

        const start = new Date(starts_at);
        if (Number.isNaN(start.getTime())) {
          return { ok: false, error: "Fecha de inicio inválida." };
        }
        const end = new Date(start.getTime() + svc.duration_minutes * 60 * 1000);

        // Idempotencia: ¿ya hay una cita confirmada de este contacto en ese slot?
        const { data: existing } = await supabase
          .from("appointments")
          .select("id")
          .eq("contact_id", ctx.contactId)
          .eq("starts_at", start.toISOString())
          .eq("status", "confirmed")
          .maybeSingle();
        if (existing) {
          return { ok: true, already_booked: true, appointment_id: existing.id };
        }

        const { data: gc } = await supabase
          .from("google_calendar_configs")
          .select("calendar_id")
          .eq("organization_id", ctx.organization.id)
          .maybeSingle();
        if (!gc) return { ok: false, error: "Calendario no conectado." };

        let googleEventId: string | null = null;
        try {
          googleEventId = await createCalendarEvent({
            organizationId: ctx.organization.id,
            calendarId: gc.calendar_id,
            timeZone: ctx.organization.timezone,
            summary: `${svc.name} — ${full_name}`,
            description: `Cita agendada por WhatsApp.\nTeléfono: ${ctx.fromPhone}${
              is_new_patient != null ? `\nNuevo paciente: ${is_new_patient ? "sí" : "no"}` : ""
            }`,
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
          });
        } catch (e) {
          log("tool.book_appointment_calendar_error", {
            organization_id: ctx.organization.id,
            error: (e as Error).message,
          });
          return { ok: false, error: "No pude crear el evento en el calendario." };
        }

        const { data: appt, error } = await supabase
          .from("appointments")
          .insert({
            organization_id: ctx.organization.id,
            contact_id: ctx.contactId,
            service: svc.name,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            google_event_id: googleEventId,
            status: "confirmed",
            is_new_patient: is_new_patient ?? null,
            full_name,
            phone: ctx.fromPhone,
          })
          .select("id")
          .single();

        if (error) {
          return { ok: false, error: "La cita no se pudo guardar." };
        }

        // Persistir datos del contacto de paso.
        await supabase
          .from("contacts")
          .update({
            full_name,
            is_new_patient: is_new_patient ?? undefined,
          })
          .eq("id", ctx.contactId);

        return {
          ok: true,
          appointment_id: appt.id,
          service: svc.name,
          starts_at: start.toISOString(),
        };
      },
    }),

    // ── save_contact_info ──
    save_contact_info: tool({
      description:
        "Guarda o actualiza datos del contacto (nombre, si es paciente nuevo) cuando los conozcas, aunque todavía no agende.",
      inputSchema: z.object({
        full_name: z.string().optional(),
        is_new_patient: z.boolean().optional(),
      }),
      execute: async ({ full_name, is_new_patient }) => {
        const patch: TablesUpdate<"contacts"> = {};
        if (full_name != null) patch.full_name = full_name;
        if (is_new_patient != null) patch.is_new_patient = is_new_patient;
        if (Object.keys(patch).length === 0) return { ok: true, noop: true };

        const { error } = await supabase
          .from("contacts")
          .update(patch)
          .eq("id", ctx.contactId);
        return error ? { ok: false, error: error.message } : { ok: true };
      },
    }),

    // ── request_human_handoff ──
    request_human_handoff: tool({
      description:
        "Deriva la conversación a un humano: desactiva el bot en este hilo y avisa al cliente. Úsalo si no entiendes al cliente o si lo pide.",
      inputSchema: z.object({
        reason: z.string().optional().describe("Motivo breve del handoff."),
      }),
      execute: async ({ reason }) => {
        await supabase
          .from("conversations")
          .update({ bot_active: false })
          .eq("id", ctx.conversationId);

        ctx.handoffRequested.value = true;
        log("tool.handoff", {
          organization_id: ctx.organization.id,
          conversation_id: ctx.conversationId,
          reason: reason ?? null,
        });
        // El runner enviará el handoff_message; devolvemos ese texto para que el
        // modelo no genere otro mensaje encima.
        return {
          ok: true,
          handoff_message: ctx.agentConfig.handoff_message,
        };
      },
    }),
  };
}
