// ============================================================================
// Runner del agente IA (AI SDK 6 + Anthropic Claude Sonnet 5).
//
// Notas de modelo (ver decisiones de stack en el README):
//   * Modelo: claude-sonnet-5 (Sonnet actual).
//   * SIN temperature: Sonnet 5 devuelve 400 ante cualquier temperature ≠ default.
//     El tono se controla desde el system prompt.
//   * thinking: { type: 'disabled' } + effort 'medium' para cumplir el criterio
//     de latencia (< 5 s). Subir a effort 'high' si la calidad lo requiere.
//   * stopWhen: stepCountIs(8) para permitir varias rondas de tool-use.
// ============================================================================

import { generateText, stepCountIs, type ModelMessage } from "ai";
import { anthropic, type AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSystemPrompt } from "@/lib/agent/config";
import { buildTools } from "@/lib/agent/tools";

const MODEL = "claude-sonnet-5";
const HISTORY_LIMIT = 20; // últimos N mensajes del hilo como contexto

export interface RunAgentParams {
  organizationId: string;
  conversationId: string;
  contactId: string;
  fromPhone: string;
}

export interface RunAgentResult {
  text: string;
  handoff: boolean;
}

const providerOptions = {
  anthropic: {
    thinking: { type: "disabled" },
    effort: "medium",
  } satisfies AnthropicProviderOptions,
};

/**
 * Ejecuta el agente para el último estado de una conversación y devuelve el
 * texto de respuesta. Carga config + historial; el envío por WhatsApp lo hace
 * quien llama (el webhook), no esta función.
 */
export async function runAgent(
  params: RunAgentParams,
): Promise<RunAgentResult> {
  const supabase = createAdminClient();

  // Cargar organización, agent_config e historial en paralelo.
  const [orgRes, cfgRes, msgsRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("*")
      .eq("id", params.organizationId)
      .single(),
    supabase
      .from("agent_configs")
      .select("*")
      .eq("organization_id", params.organizationId)
      .single(),
    supabase
      .from("messages")
      .select("direction, sender, content")
      .eq("conversation_id", params.conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  if (orgRes.error || !orgRes.data) {
    throw new Error(`No pude cargar la organización: ${orgRes.error?.message}`);
  }
  if (cfgRes.error || !cfgRes.data) {
    throw new Error(`No pude cargar agent_configs: ${cfgRes.error?.message}`);
  }

  const organization = orgRes.data;
  const agentConfig = cfgRes.data;

  // El historial viene descendente; lo invertimos a orden cronológico y lo
  // mapeamos a ModelMessage. Entrantes = user; salientes (bot/humano) = assistant.
  const history = (msgsRes.data ?? [])
    .slice()
    .reverse()
    .filter((m) => m.content)
    .map<ModelMessage>((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.content as string,
    }));

  const handoffRequested = { value: false };
  const tools = buildTools({
    organization,
    agentConfig,
    conversationId: params.conversationId,
    contactId: params.contactId,
    fromPhone: params.fromPhone,
    handoffRequested,
  });

  const result = await generateText({
    model: anthropic(MODEL),
    system: buildSystemPrompt({ organization, agentConfig }),
    messages: history,
    tools,
    stopWhen: stepCountIs(8),
    providerOptions,
  });

  // Si el agente derivó a un humano, el mensaje al cliente es el handoff_message
  // configurado, no lo que el modelo haya generado además.
  if (handoffRequested.value) {
    return { text: agentConfig.handoff_message, handoff: true };
  }

  return { text: result.text.trim(), handoff: false };
}
