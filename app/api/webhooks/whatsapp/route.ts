// ============================================================================
// Webhook de WhatsApp Cloud API. Lo más crítico del sistema.
//
// runtime = 'nodejs': necesitamos crypto nativo para el HMAC y el procesamiento
// puede tardar. dynamic = 'force-dynamic': nunca cachear.
//
// GET  → verificación del webhook (hub.mode / hub.verify_token / hub.challenge).
// POST → eventos. Responde 200 lo antes posible y procesa en after().
// ============================================================================

import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signature";
import {
  extractInboundMessages,
  extractPhoneNumberId,
  processInboundMessage,
} from "@/lib/whatsapp/process";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── GET: verificación ──
// Meta manda hub.mode=subscribe, hub.verify_token, hub.challenge.
// El verify_token tiene formato "{org_slug}:{secret}" para identificar la
// organización sin depender de otro estado.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const sep = token.indexOf(":");
  if (sep === -1) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const orgSlug = token.slice(0, sep);
  const secret = token.slice(sep + 1);

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (!org) return new NextResponse("Forbidden", { status: 403 });

  const { data: cfg } = await supabase
    .from("whatsapp_configs")
    .select("verify_token")
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!cfg || cfg.verify_token !== secret) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Verificación correcta: devolver el challenge en texto plano.
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// ── POST: eventos ──
export async function POST(request: NextRequest) {
  // 1. Body CRUDO (sin parsear) para verificar la firma.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // 2. Parsear una copia solo para resolver la organización (aún no confiamos).
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const phoneNumberId = extractPhoneNumberId(payload);
  if (!phoneNumberId) {
    // Evento sin phone_number_id (p.ej. un ping). Aceptar y salir.
    return NextResponse.json({ received: true });
  }

  const supabase = createAdminClient();
  const { data: cfg } = await supabase
    .from("whatsapp_configs")
    .select("organization_id, app_secret_encrypted")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  if (!cfg) {
    log("webhook.unknown_phone_number_id", { phone_number_id: phoneNumberId });
    // No conocemos este número; aceptamos para que Meta no reintente 7 días.
    return NextResponse.json({ received: true });
  }

  // 3. Verificar la firma HMAC contra el body crudo.
  const appSecret = decrypt(cfg.app_secret_encrypted);
  const valid = verifyWhatsAppSignature(rawBody, signature, appSecret);
  if (!valid) {
    log("webhook.invalid_signature", {
      organization_id: cfg.organization_id,
      phone_number_id: phoneNumberId,
    });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 4. Extraer los mensajes ANTES de responder (parsing barato, sin I/O).
  const messages = extractInboundMessages(payload, cfg.organization_id);

  // 5. Procesar en background tras responder 200. Cada mensaje se maneja de
  //    forma aislada: si uno falla, se loguea pero no tumba el resto ni el 200.
  after(async () => {
    for (const msg of messages) {
      try {
        await processInboundMessage(msg);
      } catch (e) {
        log("webhook.process_uncaught", {
          organization_id: msg.organizationId,
          wa_message_id: msg.waMessageId,
          error: (e as Error).message,
        });
      }
    }
  });

  // 6. 200 inmediato, pase lo que pase con el procesamiento posterior.
  return NextResponse.json({ received: true });
}
