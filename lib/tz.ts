// ============================================================================
// tz.ts — utilidades de zona horaria sin dependencias externas (solo Intl).
//
// Todo el agendamiento razona en la timezone de la organización (IANA, ej.
// "America/Mexico_City"), no en UTC ni en la del servidor. Estas funciones
// convierten entre "hora de pared en una timezone" e instantes absolutos (UTC).
// ============================================================================

/** Offset (ms) de la timezone respecto a UTC en el instante `date`. tz - utc. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

/**
 * Convierte una hora de pared (año/mes/día/hora/minuto en `timeZone`) al Date
 * absoluto (UTC) correspondiente. Maneja DST vía doble aproximación.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offset1 = tzOffsetMs(new Date(utcGuess), timeZone);
  const candidate = utcGuess - offset1;
  // Reajuste por si el offset cambió alrededor de un salto de DST.
  const offset2 = tzOffsetMs(new Date(candidate), timeZone);
  return new Date(utcGuess - offset2);
}

/** Clave de día de la semana (mon..sun) de un instante, en la timezone dada. */
export function weekdayKey(date: Date, timeZone: string): string {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  })
    .format(date)
    .toLowerCase();
  // en-US da "mon","tue",... exactamente las claves que usamos en business_hours.
  return wd;
}

/** Componentes de fecha (año/mes/día) de un instante en la timezone dada. */
export function zonedDateParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

const WEEKDAY_INDEX: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/**
 * Rango [inicio, fin) de la semana ACTUAL (lunes 00:00 → lunes siguiente 00:00)
 * en la timezone dada, como instantes UTC. Para el KPI de citas de la semana.
 */
export function currentWeekRangeUtc(timeZone: string): { start: Date; end: Date } {
  const now = new Date();
  const wd = WEEKDAY_INDEX[weekdayKey(now, timeZone)] ?? 0;
  // Retrocede hasta el lunes calculando sobre las fechas de pared en la tz.
  const { year, month, day } = zonedDateParts(now, timeZone);
  // Construir el lunes restando `wd` días a la fecha de pared de hoy.
  const mondayUtcGuess = Date.UTC(year, month - 1, day) - wd * 24 * 60 * 60 * 1000;
  const md = new Date(mondayUtcGuess);
  const start = zonedWallTimeToUtc(
    md.getUTCFullYear(),
    md.getUTCMonth() + 1,
    md.getUTCDate(),
    0,
    0,
    timeZone,
  );
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Etiqueta legible en español de un instante, en la timezone dada. */
export function humanLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
