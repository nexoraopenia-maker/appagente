// ============================================================================
// crypto.ts — cifrado de secretos en reposo (AES-256-GCM).
//
// Todos los tokens de terceros (access tokens de WhatsApp y Google, refresh
// tokens, app_secret de Meta) se guardan cifrados en la BD. Este módulo es el
// único punto donde se cifra/descifra.
//
// Formato del texto cifrado (string): "iv:authTag:ciphertext", cada parte en
// base64. GCM aporta autenticación: si el texto cifrado o el authTag se alteran,
// decrypt() lanza en vez de devolver basura.
//
// Solo servidor. Nunca importar desde un componente cliente.
// ============================================================================

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits, el nonce recomendado para GCM
const KEY_LENGTH = 32; // 256 bits

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY no está definida. Genérala con `openssl rand -base64 32` y ponla en .env.local.",
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY debe ser 32 bytes en base64 (256 bits); recibí ${key.length} bytes. Regénérala con \`openssl rand -base64 32\`.`,
    );
  }

  cachedKey = key;
  return key;
}

/** Cifra texto plano. Devuelve "iv:authTag:ciphertext" (todo base64). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Descifra el formato producido por encrypt(). Lanza si fue manipulado. */
export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Texto cifrado con formato inválido (se esperaba iv:authTag:ciphertext).");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
