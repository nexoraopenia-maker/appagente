// Envío de mensajes salientes por WhatsApp Cloud API + registro en messages.
//
// Solo servidor. Usa el cliente admin (service_role) porque se invoca tanto
// desde el webhook (sin sesión) como desde el dashboard.
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { messagesEndpoint } from "@/lib/whatsapp/config";

export interface SendResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

/**
 * Envía un mensaje de texto a un número por WhatsApp y lo persiste como outbound.
 *
 * @param sender  'bot' si lo generó el agente, 'human' si lo escribió el dueño.
 */
export async function sendWhatsAppMessage(params: {
  organizationId: string;
  conversationId: string;
  to: string; // E.164 sin '+', como lo espera Meta (ej. 5218112345678)
  text: string;
  sender: "bot" | "human";
}): Promise<SendResult> {
  const { organizationId, conversationId, to, text, sender } = params;
  const supabase = createAdminClient();

  const { data: cfg, error: cfgErr } = await supabase
    .from("whatsapp_configs")
    .select("phone_number_id, access_token_encrypted")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (cfgErr || !cfg) {
    return { ok: false, error: "WhatsApp no está configurado para esta organización." };
  }

  const accessToken = decrypt(cfg.access_token_encrypted);
  const toNormalized = to.replace(/^\+/, "");

  let waMessageId: string | undefined;
  try {
    const res = await fetch(messagesEndpoint(cfg.phone_number_id), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toNormalized,
        type: "text",
        text: { body: text },
      }),
    });
    const body = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: body.error?.message ?? `Meta respondió ${res.status}` };
    }
    waMessageId = body.messages?.[0]?.id;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Persistir el mensaje saliente y refrescar last_message_at.
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    organization_id: organizationId,
    wa_message_id: waMessageId ?? null,
    direction: "outbound",
    sender,
    content: text,
  });
  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { ok: true, waMessageId };
}
