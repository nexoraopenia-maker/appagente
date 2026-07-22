"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  message?: string;
}

/** Login con email + password. */
export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Email y contraseña son obligatorios." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: traducirError(error.message) };

  redirect(redirectTo || "/dashboard");
}

/** Signup con email + password. El onboarding (crear organización) ocurre después. */
export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: traducirError(error.message) };

  // Si la confirmación por email está activada, no hay sesión aún.
  if (!data.session) {
    return {
      message:
        "Te enviamos un correo de confirmación. Ábrelo para activar tu cuenta y luego inicia sesión.",
    };
  }

  redirect("/onboarding");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function traducirError(msg: string): string {
  if (/invalid login credentials/i.test(msg))
    return "Email o contraseña incorrectos.";
  if (/already registered/i.test(msg))
    return "Ese email ya tiene una cuenta. Inicia sesión.";
  return msg;
}
