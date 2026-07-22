"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send";

export interface ConvActionResult {
  ok?: boolean;
  error?: string;
}

/** Activa o desactiva el bot en una conversación (handoff humano). */
export async function toggleBot(
  conversationId: string,
  active: boolean,
): Promise<ConvActionResult> {
  const { organization } = await requireUser();
  const supabase = await createClient();

  // La cláusula por organization_id es redundante con RLS, pero explícita.
  const { error } = await supabase
    .from("conversations")
    .update({ bot_active: active })
    .eq("id", conversationId)
    .eq("organization_id", organization!.id);

  if (error) return { error: error.message };
  revalidatePath(`/conversaciones/${conversationId}`);
  return { ok: true };
}

/** Envía un mensaje escrito por el dueño (sender = 'human') vía Cloud API. */
export async function sendHumanMessage(
  conversationId: string,
  text: string,
): Promise<ConvActionResult> {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Mensaje vacío." };

  const { organization } = await requireUser();
  const supabase = await createClient();

  // Cargar la conversación + teléfono del contacto (bajo RLS del usuario).
  const { data: conv, error } = await supabase
    .from("conversations")
    .select("id, contact:contacts(wa_phone)")
    .eq("id", conversationId)
    .eq("organization_id", organization!.id)
    .maybeSingle();

  if (error || !conv) return { error: "Conversación no encontrada." };
  const phone = (conv.contact as { wa_phone: string } | null)?.wa_phone;
  if (!phone) return { error: "El contacto no tiene teléfono." };

  const res = await sendWhatsAppMessage({
    organizationId: organization!.id,
    conversationId,
    to: phone,
    text: trimmed,
    sender: "human",
  });

  if (!res.ok) return { error: res.error ?? "No se pudo enviar." };
  revalidatePath(`/conversaciones/${conversationId}`);
  return { ok: true };
}
