import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function keyFromHex(keyHex: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error("32-byte encryption key must be 64 hexadecimal characters");
  }

  return Buffer.from(keyHex, "hex");
}

export function sealSecret(value: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(".");
}

export function unsealSecret(sealedValue: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const [ivHex, authTagHex, ciphertextHex] = sealedValue.split(".");

  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Invalid sealed secret");
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
