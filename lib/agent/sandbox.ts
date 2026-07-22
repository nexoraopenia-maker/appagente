// ============================================================================
// sandbox.ts — ejecuta el agente para el botón "Probar agente" de /personalizacion.
//
// Usa el MISMO system prompt y modelo que producción, pero con tools en modo
// dry-run: get_available_slots devuelve horarios sintéticos y book_appointment /
// save_contact_info / request_human_handoff no escriben nada. Así el dueño valida
// el prompt y el flujo sin crear citas ni eventos reales.
// ============================================================================

import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { anthropic, type AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSystemPrompt, parseServices } from "@/lib/agent/config";
import { humanLabel } from "@/lib/tz";

const MODEL = "claude-sonnet-5";

const providerOptions = {
  anthropic: {
    thinking: { type: "disabled" },
    effort: "medium",
  } satisfies AnthropicProviderOptions,
};

export async function runAgentSandbox(params: {
  organizationId: string;
  messages: ModelMessage[];
}): Promise<string> {
  const supabase = createAdminClient();

  const [orgRes, cfgRes] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", params.organizationId).single(),
    supabase
      .from("agent_configs")
      .select("*")
      .eq("organization_id", params.organizationId)
      .single(),
  ]);
  if (orgRes.error || !orgRes.data) throw new Error("No pude cargar la organización.");
  if (cfgRes.error || !cfgRes.data) throw new Error("No pude cargar la configuración.");

  const organization = orgRes.data;
  const agentConfig = cfgRes.data;
  const services = parseServices(agentConfig.services);

  // Tools dry-run: misma forma que las reales, pero sin efectos.
  const tools = {
    get_available_slots: tool({
      description:
        "Devuelve 3 huecos libres para un servicio. (Sandbox: horarios de ejemplo.)",
      inputSchema: z.object({
        service: z.string(),
        days_ahead: z.number().int().min(1).max(30).optional(),
      }),
      execute: async ({ service }) => {
        const svc =
          services.find((s) => s.name.toLowerCase() === service.trim().toLowerCase()) ??
          services[0];
        if (!svc) return { ok: false, error: "No hay servicios configurados." };
        // Tres huecos sintéticos: mañana, pasado y en 3 días, a las 10:00.
        const base = Date.now();
        const slots = [1, 2, 3].map((d) => {
          const start = new Date(base + d * 24 * 60 * 60 * 1000);
          start.setHours(10, 0, 0, 0);
          return {
            starts_at: start.toISOString(),
            ends_at: new Date(start.getTime() + svc.duration_minutes * 60000).toISOString(),
            label: humanLabel(start, organization.timezone),
          };
        });
        return { ok: true, service: svc.name, slots };
      },
    }),
    book_appointment: tool({
      description: "Agenda la cita. (Sandbox: no crea nada real.)",
      inputSchema: z.object({
        full_name: z.string(),
        service: z.string(),
        starts_at: z.string(),
        is_new_patient: z.boolean().optional(),
      }),
      execute: async ({ service, starts_at }) => ({
        ok: true,
        sandbox: true,
        service,
        starts_at,
      }),
    }),
    save_contact_info: tool({
      description: "Guarda datos del contacto. (Sandbox: no persiste.)",
      inputSchema: z.object({
        full_name: z.string().optional(),
        is_new_patient: z.boolean().optional(),
      }),
      execute: async () => ({ ok: true, sandbox: true }),
    }),
    request_human_handoff: tool({
      description: "Deriva a un humano. (Sandbox: solo devuelve el mensaje.)",
      inputSchema: z.object({ reason: z.string().optional() }),
      execute: async () => ({ ok: true, handoff_message: agentConfig.handoff_message }),
    }),
  };

  const result = await generateText({
    model: anthropic(MODEL),
    system: buildSystemPrompt({ organization, agentConfig }),
    messages: params.messages,
    tools,
    stopWhen: stepCountIs(8),
    providerOptions,
  });

  return result.text.trim();
}
