
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { env } from "../../config/env.js";

//config
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const FORMAT_VERSION = "v1";

const encryptionKey = Buffer.from(
  env.INVITATION_ENCRYPTION_KEY,
  "base64",
);

if (encryptionKey.length !== KEY_LENGTH) {
  throw new Error("Invalid invitation encryption key");
}

/**
 * Encrypts an invitation token using AES-256-GCM.
 * Returns a versioned string containing the IV, auth tag and ciphertext.
 */
export function encryptInvitationToken(token: string): string {
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts an invitation token and verifies its authenticity.
 * Throws an error if the encrypted value is invalid or has been modified.
 */
export function decryptInvitationToken(
  encryptedToken: string,
): string {
  const parts = encryptedToken.split(".");

  if (parts.length !== 4) {
    throw new Error("Invalid encrypted invitation token");
  }

  const [version, ivEncoded, authTagEncoded, ciphertextEncoded] = parts;

  if (
    version !== FORMAT_VERSION ||
    !ivEncoded ||
    !authTagEncoded ||
    !ciphertextEncoded
  ) {
    throw new Error("Invalid encrypted invitation token");
  }

  const iv = Buffer.from(ivEncoded, "base64url");
  const authTag = Buffer.from(authTagEncoded, "base64url");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64url");

  if (
    iv.length !== IV_LENGTH ||
    authTag.length !== AUTH_TAG_LENGTH ||
    ciphertext.length === 0
  ) {
    throw new Error("Invalid encrypted invitation token");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
