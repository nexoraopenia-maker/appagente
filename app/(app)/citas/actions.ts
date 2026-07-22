"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteCalendarEvent } from "@/lib/google/calendar";

export interface CitaActionResult {
  ok?: boolean;
  error?: string;
}

/**
 * Cambia el status de una cita. Al cancelar, elimina también el evento de Google
 * Calendar (sincronización). 'completed' no toca el calendario.
 */
export async function updateAppointmentStatus(
  appointmentId: string,
  status: "cancelled" | "completed",
): Promise<CitaActionResult> {
  const { organization } = await requireUser();
  const supabase = await createClient();

  const { data: appt, error: readErr } = await supabase
    .from("appointments")
    .select("id, google_event_id")
    .eq("id", appointmentId)
    .eq("organization_id", organization!.id)
    .maybeSingle();

  if (readErr || !appt) return { error: "Cita no encontrada." };

  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", appointmentId)
    .eq("organization_id", organization!.id);

  if (error) return { error: error.message };

  // Sincronizar cancelación con Google Calendar.
  if (status === "cancelled" && appt.google_event_id) {
    const { data: gc } = await supabase
      .from("google_calendar_configs")
      .select("calendar_id")
      .eq("organization_id", organization!.id)
      .maybeSingle();
    if (gc) {
      try {
        await deleteCalendarEvent({
          organizationId: organization!.id,
          calendarId: gc.calendar_id,
          eventId: appt.google_event_id,
        });
      } catch {
        // La cita ya quedó cancelada en la BD; si falla el borrado en Google
        // no revertimos, pero lo dejamos registrado por el helper.
      }
    }
  }

  revalidatePath("/citas");
  return { ok: true };
}
