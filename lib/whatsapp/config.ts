// ============================================================================
// Configuración central de WhatsApp Cloud API (Graph API de Meta).
//
// GRAPH_API_VERSION está aquí, en un solo lugar, a propósito: Meta libera una
// versión nueva cada ~3 meses y mantiene cada una ~2 años. Cuando toque migrar,
// se cambia esta línea y nada más.
//
// v25.0 fue lanzada por Meta el 18 de febrero de 2026 y es la vigente al
// construir este proyecto. ⚠️ Antes de desplegar, verifica en el changelog
// (https://developers.facebook.com/docs/graph-api/changelog) que siga siendo la
// versión recomendada y que no haya salido una superior estable.
// ============================================================================

export const GRAPH_API_VERSION = "v25.0";

export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** URL del endpoint de envío de mensajes para un phone_number_id dado. */
export function messagesEndpoint(phoneNumberId: string): string {
  return `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
}

/** URL para verificar que un phone_number_id + token son válidos ("Probar conexión"). */
export function phoneNumberEndpoint(phoneNumberId: string): string {
  return `${GRAPH_API_BASE}/${phoneNumberId}`;
}
