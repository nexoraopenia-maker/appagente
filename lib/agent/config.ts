// Composición del system prompt del agente a partir de agent_configs.
//
// El prompt se construye en cada invocación (no se cachea) para que un cambio en
// /personalizacion afecte la respuesta siguiente.
import type { Tables } from "@/lib/database.types";

export interface Service {
  name: string;
  duration_minutes: number;
  description?: string;
}

export interface AgentContext {
  organization: Tables<"organizations">;
  agentConfig: Tables<"agent_configs">;
}

export function parseServices(raw: unknown): Service[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Service => Boolean(s) && typeof s === "object" && "name" in s)
    .map((s) => ({
      name: String(s.name),
      duration_minutes: Number(s.duration_minutes) || 30,
      description: s.description ? String(s.description) : undefined,
    }));
}

export function buildSystemPrompt(ctx: AgentContext): string {
  const { organization, agentConfig } = ctx;
  const services = parseServices(agentConfig.services);
  const businessInfo = agentConfig.business_info as Record<string, unknown>;
  const collectNewPatient = agentConfig.collect_new_patient;

  const servicesList =
    services.length > 0
      ? services
          .map(
            (s) =>
              `- ${s.name} (${s.duration_minutes} min)${s.description ? `: ${s.description}` : ""}`,
          )
          .join("\n")
      : "(sin servicios configurados)";

  const infoLines = Object.entries(businessInfo)
    .filter(([, v]) => v && String(v).trim() !== "")
    .map(([k, v]) => `- ${k}: ${String(v)}`)
    .join("\n");

  const now = new Date();
  const hoy = new Intl.DateTimeFormat("es-MX", {
    timeZone: organization.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);

  const datosCita = [
    "- Nombre completo del cliente (pregúntalo en el chat).",
    "- Servicio (elige entre los configurados).",
    "- Fecha y hora (debe coincidir con un hueco realmente disponible).",
    collectNewPatient ? "- Si es paciente nuevo (sí/no)." : null,
    "El teléfono NO se pregunta: ya lo tienes del propio WhatsApp.",
  ]
    .filter(Boolean)
    .join("\n");

  return `${agentConfig.system_prompt}

## Tono
Responde siempre en un tono ${agentConfig.tone}. Es un chat de WhatsApp: mensajes breves y naturales, sin párrafos largos.

## Negocio
Nombre: ${organization.name}
Zona horaria: ${organization.timezone}
Fecha y hora actual: ${hoy}
${infoLines ? `\nDatos:\n${infoLines}` : ""}

## Servicios disponibles
${servicesList}

## Cómo agendar una cita
1. Averigua qué servicio quiere.
2. Usa la herramienta get_available_slots para ofrecer 3 huecos libres reales. NUNCA inventes horarios.
3. Recoge estos datos antes de confirmar:
${datosCita}
4. Cuando tengas todo y el cliente confirme un horario, usa book_appointment.
5. Guarda datos del contacto con save_contact_info cuando los conozcas.

## Reglas
- No confirmes una cita sin haber llamado a book_appointment.
- Si no entiendes al cliente, o pide hablar con una persona, usa request_human_handoff.
- No prometas horarios que no vengan de get_available_slots.`;
}
