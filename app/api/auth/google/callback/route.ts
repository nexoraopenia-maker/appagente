// Callback de OAuth de Google: intercambia el `code` por tokens, guarda el
// refresh_token cifrado y preselecciona el calendario primario si aún no hay uno.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOAuthClient } from "@/lib/google/oauth";
import { encrypt } from "@/lib/crypto";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const stateOrgId = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const back = (msg: string) =>
    NextResponse.redirect(`${origin}/integraciones?google=${encodeURIComponent(msg)}`);

  if (oauthError) return back(`denegado:${oauthError}`);
  if (!code) return back("error:sin_codigo");

  // Validar sesión y que la org del state sea la del usuario.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const orgId = profile?.organization_id;
  if (!orgId || (stateOrgId && stateOrgId !== orgId)) {
    return back("error:organizacion_no_coincide");
  }

  try {
    const oauth = getOAuthClient();
    const { tokens } = await oauth.getToken(code);

    if (!tokens.refresh_token) {
      // Google solo devuelve refresh_token la primera vez salvo prompt=consent.
      return back("error:sin_refresh_token");
    }

    // upsert de la config: refresh cifrado, access cifrado, calendario primario
    // por defecto (el usuario puede cambiarlo en la página).
    const { error } = await supabase.from("google_calendar_configs").upsert(
      {
        organization_id: orgId,
        calendar_id: "primary",
        refresh_token_encrypted: encrypt(tokens.refresh_token),
        access_token_encrypted: tokens.access_token
          ? encrypt(tokens.access_token)
          : null,
        token_expires_at: tokens.expiry_date
          ? new Date(tokens.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );

    if (error) return back(`error:${error.message}`);
    return back("ok:conectado");
  } catch (e) {
    return back(`error:${(e as Error).message}`);
  }
}
