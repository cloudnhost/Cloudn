import crypto from "node:crypto";

// Node secrets are unusual among the credentials this app stores: most
// (user passwords, node secrets as *verified by the Panel*) only ever need
// one-way hashing. But per docs/CLOUDN_AGENT_INTEGRATION.md §2.1, the
// SAME secret is used in both directions — the Agent presents it when
// calling the Panel (register/heartbeat/events), and the Panel presents it
// when calling the Agent's own REST API (server lifecycle, files,
// backups). A one-way hash can verify the former but can't reconstruct
// the latter, so node secrets need reversible, at-rest encryption instead
// of hashing. This is the only credential in the system handled this way,
// and it's why NodeCredential is shaped differently from every other
// secret here.
//
// AES-256-GCM: authenticated encryption, so tampering with stored
// ciphertext is detected (decrypt throws) rather than silently producing
// garbage that gets sent to an Agent.

function getKey(): Buffer {
  const configured = process.env.NODE_CREDENTIAL_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "hex");
    if (key.length !== 32) {
      throw new Error("NODE_CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
    }
    return key;
  }
  // Development fallback only — derives a key from SESSION_SECRET so local
  // dev doesn't require a second secret to be configured. Production
  // deployments should set NODE_CREDENTIAL_ENCRYPTION_KEY explicitly; see
  // .env.example.
  const fallback = process.env.SESSION_SECRET ?? "cloudn-dev-only-insecure-fallback";
  return crypto.scryptSync(fallback, "cloudn-node-credential-salt", 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv (12) + authTag (16) + ciphertext, base64-encoded as one blob.
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
