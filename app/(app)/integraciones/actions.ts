"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";
import { phoneNumberEndpoint } from "@/lib/whatsapp/config";

export interface ActionResult {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** Guarda (cifradas) las credenciales de WhatsApp de la organización. */
export async function saveWhatsAppConfig(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { organization } = await requireUser();
  if (!organization) return { error: "Sin organización." };

  const phone_number_id = String(formData.get("phone_number_id") ?? "").trim();
  const waba_id = String(formData.get("waba_id") ?? "").trim();
  const access_token = String(formData.get("access_token") ?? "").trim();
  const verify_token = String(formData.get("verify_token") ?? "").trim();
  const app_secret = String(formData.get("app_secret") ?? "").trim();

  if (!phone_number_id || !waba_id || !access_token || !verify_token || !app_secret) {
    return { error: "Todos los campos de WhatsApp son obligatorios." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("whatsapp_configs").upsert(
    {
      organization_id: organization.id,
      phone_number_id,
      waba_id,
      access_token_encrypted: encrypt(access_token),
      verify_token, // texto plano por diseño (el schema lo define así)
      app_secret_encrypted: encrypt(app_secret),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );

  if (error) return { error: error.message };

  revalidatePath("/integraciones");
  return { ok: true, message: "Credenciales de WhatsApp guardadas." };
}

/**
 * Prueba la conexión pegando al endpoint del phone_number_id con el access token.
 * No lee de la BD: usa los valores del formulario para que el usuario pueda
 * validar antes de guardar.
 */
export async function testWhatsAppConnection(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const phone_number_id = String(formData.get("phone_number_id") ?? "").trim();
  const access_token = String(formData.get("access_token") ?? "").trim();

  if (!phone_number_id || !access_token) {
    return { error: "Necesito Phone Number ID y Access Token para probar." };
  }

  try {
    const res = await fetch(
      `${phoneNumberEndpoint(phone_number_id)}?fields=verified_name,display_phone_number`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    const body = (await res.json()) as {
      verified_name?: string;
      display_phone_number?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { error: `Meta respondió ${res.status}: ${body.error?.message ?? "error desconocido"}` };
    }
    return {
      ok: true,
      message: `Conexión OK: ${body.verified_name ?? ""} (${body.display_phone_number ?? phone_number_id}).`,
    };
  } catch (e) {
    return { error: `No pude contactar a Meta: ${(e as Error).message}` };
  }
}
