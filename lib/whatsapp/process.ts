// ============================================================================
// process.ts — procesamiento en background de un mensaje entrante de WhatsApp.
//
// Lo llama el webhook dentro de after(), DESPUÉS de responder 200 y de verificar
// la firma. Responsabilidades:
//   1. upsert del contacto por (organization_id, wa_phone)
//   2. upsert de la conversación del contacto
//   3. insertar el mensaje entrante con wa_message_id (idempotente: si ya existe
//      ese id, no se procesa de nuevo — Meta reenvía eventos)
//   4. si conversation.bot_active → invocar al agente y responder
//
// Usa el cliente admin (service_role) y filtra siempre por organization_id.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";
import { log } from "@/lib/log";

/** Un mensaje de texto entrante ya extraído del payload de Meta. */
export interface InboundMessage {
  organizationId: string;
  waMessageId: string;
  fromPhone: string; // E.164 sin '+', tal cual lo manda Meta
  text: string;
  profileName: string | null;
}

/**
 * Extrae el/los mensaje(s) de texto de un payload de webhook de Meta.
 * Devuelve [] si el evento no es un mensaje de texto entrante (p.ej. un status).
 */
export function extractInboundMessages(
  payload: unknown,
  organizationId: string,
): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value ?? {};
      const messages = (value.messages as unknown[]) ?? [];
      const contacts = (value.contacts as unknown[]) ?? [];
      const profileName =
        (contacts[0] as { profile?: { name?: string } })?.profile?.name ?? null;

      for (const m of messages) {
        const msg = m as {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        };
        if (msg.type !== "text" || !msg.id || !msg.from || !msg.text?.body) {
          continue; // ignoramos imágenes, audios, statuses, etc. en esta versión
        }
        out.push({
          organizationId,
          waMessageId: msg.id,
          fromPhone: msg.from,
          text: msg.text.body,
          profileName,
        });
      }
    }
  }
  return out;
}

/** Resuelve el phone_number_id del payload (para identificar la organización). */
export function extractPhoneNumberId(payload: unknown): string | null {
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: { metadata?: { phone_number_id?: string } } })
        ?.value;
      const id = value?.metadata?.phone_number_id;
      if (id) return id;
    }
  }
  return null;
}

/**
 * Persiste un mensaje entrante y, si procede, dispara la respuesta del agente.
 * Idempotente por wa_message_id: un reenvío de Meta no duplica ni re-responde.
 */
export async function processInboundMessage(msg: InboundMessage): Promise<void> {
  const started = Date.now();
  const supabase = createAdminClient();

  // 1. Contacto (upsert por org + teléfono).
  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .upsert(
      {
        organization_id: msg.organizationId,
        wa_phone: msg.fromPhone,
        full_name: msg.profileName,
      },
      { onConflict: "organization_id,wa_phone" },
    )
    .select("id, full_name")
    .single();

  if (contactErr || !contact) {
    log("webhook.contact_upsert_error", {
      organization_id: msg.organizationId,
      wa_message_id: msg.waMessageId,
      error: contactErr?.message,
    });
    return;
  }

  // 2. Conversación (una por contacto; unique index sobre contact_id).
  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .upsert(
      {
        organization_id: msg.organizationId,
        contact_id: contact.id,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "contact_id" },
    )
    .select("id, bot_active")
    .single();

  if (convErr || !conversation) {
    log("webhook.conversation_upsert_error", {
      organization_id: msg.organizationId,
      wa_message_id: msg.waMessageId,
      error: convErr?.message,
    });
    return;
  }

  // 3. Insertar el mensaje entrante. La restricción unique(wa_message_id) da la
  //    idempotencia: si Meta reenvía el evento, el insert choca y abortamos.
  const { error: insertErr } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    organization_id: msg.organizationId,
    wa_message_id: msg.waMessageId,
    direction: "inbound",
    sender: "contact",
    content: msg.text,
    raw: { text: msg.text, from: msg.fromPhone },
  });

  if (insertErr) {
    // 23505 = unique_violation → ya lo procesamos antes. No es un error real.
    if (insertErr.code === "23505") {
      log("webhook.duplicate_ignored", {
        organization_id: msg.organizationId,
        wa_message_id: msg.waMessageId,
      });
      return;
    }
    log("webhook.message_insert_error", {
      organization_id: msg.organizationId,
      wa_message_id: msg.waMessageId,
      error: insertErr.message,
    });
    return;
  }

  // 4. Si el bot está desactivado (handoff humano), no respondemos.
  if (!conversation.bot_active) {
    log("webhook.bot_inactive_skip", {
      organization_id: msg.organizationId,
      conversation_id: conversation.id,
    });
    return;
  }

  // 5. Invocar al agente y enviar la respuesta.
  try {
    const reply = await runAgent({
      organizationId: msg.organizationId,
      conversationId: conversation.id,
      contactId: contact.id,
      fromPhone: msg.fromPhone,
    });

    if (reply.text) {
      await sendWhatsAppMessage({
        organizationId: msg.organizationId,
        conversationId: conversation.id,
        to: msg.fromPhone,
        text: reply.text,
        sender: "bot",
      });
    }

    log("webhook.processed", {
      organization_id: msg.organizationId,
      conversation_id: conversation.id,
      wa_message_id: msg.waMessageId,
      latency_ms: Date.now() - started,
      handoff: reply.handoff ?? false,
    });
  } catch (e) {
    log("webhook.agent_error", {
      organization_id: msg.organizationId,
      conversation_id: conversation.id,
      wa_message_id: msg.waMessageId,
      latency_ms: Date.now() - started,
      error: (e as Error).message,
    });
  }
}
