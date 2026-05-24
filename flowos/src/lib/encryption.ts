// Encriptación simétrica AES-256-GCM para secretos a nivel app (ej: API keys
// que los users traen como BYOK). La clave maestra vive en AI_ENCRYPTION_KEY
// como hex de 64 chars (32 bytes). Si no está seteada, encrypt/decrypt fallan
// explícitamente para forzar al admin a configurarla.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.AI_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "AI_ENCRYPTION_KEY no configurada. Setear en Vercel env vars (32 bytes hex)."
    );
  }
  // Acepto hex de 64 chars (32 bytes) o cualquier string — en ese caso derivo
  // una key determinística con scrypt. Esto facilita probar localmente sin
  // generar 32 bytes random.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return scryptSync(raw, "flowos-ai-salt-v1", 32);
}

/**
 * Encripta un string con AES-256-GCM.
 * Formato resultante: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // GCM recomienda 96 bits
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Desencripta un string producido por encrypt(). Lanza si el ciphertext está
 * corrupto, fue manipulado, o la key cambió.
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Encrypted value format inválido");
  }
  const [ivHex, authTagHex, ctHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Genera un preview seguro de una API key (ej: "sk-ant-...XyZw") para mostrar
 * en UI sin exponer el secreto entero.
 */
export function previewSecret(secret: string): string {
  if (secret.length <= 12) return "•••••";
  return `${secret.slice(0, 7)}…${secret.slice(-4)}`;
}
