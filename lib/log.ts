// Log estructurado (una línea JSON por evento). Facilita el filtrado en Vercel
// y cualquier agregador. `event` es la clave del tipo de evento; el resto son
// campos arbitrarios (organization_id, wa_message_id, latency_ms, error, ...).
export function log(event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...fields,
  });
  // Errores a stderr, el resto a stdout.
  if (event.includes("error")) console.error(line);
  else console.log(line);
}
