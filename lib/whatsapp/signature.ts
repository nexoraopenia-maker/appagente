// Verificación de la firma X-Hub-Signature-256 de Meta.
//
// Meta firma el body crudo del webhook con HMAC-SHA256 usando el App Secret.
// El header llega como "sha256=<hex>". Hay que comparar contra el body EXACTO
// recibido (bytes sin parsear): cualquier re-serialización cambia el hash.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  // timingSafeEqual exige misma longitud; si difieren, no coinciden.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
