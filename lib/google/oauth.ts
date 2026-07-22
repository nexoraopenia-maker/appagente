// Helpers de OAuth 2.0 de Google (Calendar).
import { google } from "googleapis";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar";

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_OAUTH_REDIRECT_URI.",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * URL de consentimiento. `state` lleva el organization_id (firmado no hace falta:
 * validamos la sesión en el callback y solo escribimos en la org del usuario).
 * `access_type=offline` + `prompt=consent` garantizan que Google devuelva
 * refresh_token incluso en reconexiones.
 */
export function getAuthUrl(state: string): string {
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GOOGLE_CALENDAR_SCOPE],
    state,
  });
}
