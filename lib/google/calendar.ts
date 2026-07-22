// ============================================================================
// calendar.ts — integración con Google Calendar por organización.
//
// Auth: cada organización guarda su refresh_token cifrado. getAuthorizedClient()
// lo descifra, refresca el access token cuando venció y persiste el nuevo access
// token cifrado en la BD. Usa el cliente admin (service_role) porque también se
// invoca desde el webhook, que no tiene sesión de usuario.
//
// FreeBusy y createCalendarEvent (fase 9) se añaden más abajo.
// ============================================================================

import { google, type calendar_v3 } from "googleapis";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";
import { getOAuthClient } from "@/lib/google/oauth";
import {
  zonedWallTimeToUtc,
  weekdayKey,
  zonedDateParts,
  humanLabel,
} from "@/lib/tz";

/** Cliente OAuth autorizado para la organización, con access token vigente. */
async function getAuthorizedClient(organizationId: string) {
  const supabase = createAdminClient();
  const { data: cfg, error } = await supabase
    .from("google_calendar_configs")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`No pude leer google_calendar_configs: ${error.message}`);
  if (!cfg) throw new Error("Google Calendar no está conectado para esta organización.");

  const oauth = getOAuthClient();
  oauth.setCredentials({
    refresh_token: decrypt(cfg.refresh_token_encrypted),
    access_token: cfg.access_token_encrypted
      ? decrypt(cfg.access_token_encrypted)
      : undefined,
    expiry_date: cfg.token_expires_at
      ? new Date(cfg.token_expires_at).getTime()
      : undefined,
  });

  // Refresca si vence en menos de 60 s.
  const soon = Date.now() + 60_000;
  const expired = !cfg.token_expires_at || new Date(cfg.token_expires_at).getTime() < soon;
  if (expired) {
    const { credentials } = await oauth.refreshAccessToken();
    oauth.setCredentials(credentials);
    await supabase
      .from("google_calendar_configs")
      .update({
        access_token_encrypted: credentials.access_token
          ? encrypt(credentials.access_token)
          : cfg.access_token_encrypted,
        token_expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);
  }

  return oauth;
}

export interface CalendarOption {
  id: string;
  summary: string;
  primary: boolean;
}

/** Lista los calendarios del usuario conectado (para el selector de /integraciones). */
export async function listCalendars(
  organizationId: string,
): Promise<CalendarOption[]> {
  const auth = await getAuthorizedClient(organizationId);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.calendarList.list({ maxResults: 250 });
  return (res.data.items ?? []).map((c: calendar_v3.Schema$CalendarListEntry) => ({
    id: c.id ?? "",
    summary: c.summary ?? c.id ?? "(sin nombre)",
    primary: Boolean(c.primary),
  }));
}

// getAuthorizedClient se reexporta para las funciones de la fase 9.
export { getAuthorizedClient };

// ────────────────────────────────────────────────────────────────────────────
// FreeBusy, slots y eventos
// ────────────────────────────────────────────────────────────────────────────

interface BusyInterval {
  start: number; // epoch ms
  end: number;
}

interface BusinessHourRange {
  start: string; // "HH:MM"
  end: string;
}

export interface AvailableSlot {
  starts_at: string; // ISO UTC (para guardar y crear el evento)
  ends_at: string; // ISO UTC
  label: string; // legible en la timezone de la org, en español
}

/** Lee los intervalos ocupados del calendario en una ventana [timeMin, timeMax]. */
async function getBusyIntervals(
  organizationId: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusyInterval[]> {
  const auth = await getAuthorizedClient(organizationId);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    },
  });
  const busy = res.data.calendars?.[calendarId]?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({
      start: new Date(b.start as string).getTime(),
      end: new Date(b.end as string).getTime(),
    }));
}

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

/**
 * Genera hasta `limit` slots libres para un servicio, respetando business_hours
 * (en la timezone de la organización) y la disponibilidad real del calendario.
 *
 * @param businessHours { mon:[{start,end}], ... }
 * @param durationMinutes duración del servicio
 * @param daysAhead ventana de búsqueda (por defecto 7 días)
 */
export async function findAvailableSlots(params: {
  organizationId: string;
  calendarId: string;
  timeZone: string;
  businessHours: Record<string, BusinessHourRange[]>;
  durationMinutes: number;
  daysAhead?: number;
  limit?: number;
  slotStepMinutes?: number;
}): Promise<AvailableSlot[]> {
  const {
    organizationId,
    calendarId,
    timeZone,
    businessHours,
    durationMinutes,
    daysAhead = 7,
    limit = 3,
    slotStepMinutes = 30,
  } = params;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const busy = await getBusyIntervals(organizationId, calendarId, now, windowEnd);

  const durationMs = durationMinutes * 60 * 1000;
  const slots: AvailableSlot[] = [];

  // Recorremos día a día en la timezone de la org.
  for (let dayOffset = 0; dayOffset <= daysAhead && slots.length < limit; dayOffset++) {
    const dayInstant = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const { year, month, day } = zonedDateParts(dayInstant, timeZone);
    const wd = weekdayKey(dayInstant, timeZone);
    const ranges = businessHours[wd] ?? [];

    for (const range of ranges) {
      if (slots.length >= limit) break;
      const { h: sh, m: sm } = parseHM(range.start);
      const { h: eh, m: em } = parseHM(range.end);

      let cursor = zonedWallTimeToUtc(year, month, day, sh, sm, timeZone).getTime();
      const rangeEnd = zonedWallTimeToUtc(year, month, day, eh, em, timeZone).getTime();

      while (cursor + durationMs <= rangeEnd && slots.length < limit) {
        const slotStart = cursor;
        const slotEnd = cursor + durationMs;

        // Descartar slots en el pasado (con 30 min de margen).
        if (slotStart <= now.getTime() + 30 * 60 * 1000) {
          cursor += slotStepMinutes * 60 * 1000;
          continue;
        }

        const overlaps = busy.some(
          (b) => slotStart < b.end && slotEnd > b.start,
        );
        if (!overlaps) {
          const startDate = new Date(slotStart);
          slots.push({
            starts_at: startDate.toISOString(),
            ends_at: new Date(slotEnd).toISOString(),
            label: humanLabel(startDate, timeZone),
          });
        }
        cursor += slotStepMinutes * 60 * 1000;
      }
    }
  }

  return slots;
}

/** Crea el evento de la cita en Google Calendar. Devuelve el event id. */
export async function createCalendarEvent(params: {
  organizationId: string;
  calendarId: string;
  timeZone: string;
  summary: string;
  description: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
}): Promise<string> {
  const { organizationId, calendarId, timeZone, summary, description, startsAt, endsAt } =
    params;
  const auth = await getAuthorizedClient(organizationId);
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      description,
      start: { dateTime: startsAt, timeZone },
      end: { dateTime: endsAt, timeZone },
    },
  });
  const id = res.data.id;
  if (!id) throw new Error("Google no devolvió un id de evento.");
  return id;
}

/** Cancela (borra) un evento del calendario. Silencioso si ya no existe. */
export async function deleteCalendarEvent(params: {
  organizationId: string;
  calendarId: string;
  eventId: string;
}): Promise<void> {
  const { organizationId, calendarId, eventId } = params;
  const auth = await getAuthorizedClient(organizationId);
  const calendar = google.calendar({ version: "v3", auth });
  try {
    await calendar.events.delete({ calendarId, eventId });
  } catch (e) {
    // 404/410: el evento ya no existe. No es un error para nuestro flujo.
    const code = (e as { code?: number }).code;
    if (code !== 404 && code !== 410) throw e;
  }
}
