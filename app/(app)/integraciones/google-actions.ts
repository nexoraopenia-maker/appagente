"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAuthUrl } from "@/lib/google/oauth";
import { listCalendars } from "@/lib/google/calendar";
import type { ActionResult } from "./actions";

/** Inicia el flujo OAuth de Google: redirige a la pantalla de consentimiento. */
export async function connectGoogle(): Promise<void> {
  const { organization } = await requireUser();
  if (!organization) redirect("/onboarding");
  // El state lleva el organization_id; el callback valida la sesión igualmente.
  redirect(getAuthUrl(organization.id));
}

/** Guarda el calendar_id elegido por el usuario. */
export async function saveCalendarId(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { organization } = await requireUser();
  if (!organization) return { error: "Sin organización." };

  const calendar_id = String(formData.get("calendar_id") ?? "").trim();
  if (!calendar_id) return { error: "Elige un calendario." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("google_calendar_configs")
    .update({ calendar_id, updated_at: new Date().toISOString() })
    .eq("organization_id", organization.id);

  if (error) return { error: error.message };

  revalidatePath("/integraciones");
  return { ok: true, message: "Calendario seleccionado." };
}

/**
 * Devuelve los calendarios disponibles del usuario para poblar el selector.
 * Se llama desde el Server Component de la página, no es una action de mutación.
 */
export async function getAvailableCalendars(organizationId: string) {
  return listCalendars(organizationId);
}
