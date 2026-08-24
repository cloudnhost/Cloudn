import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { fail } from "../utils/response.js";
import { decryptSecret } from "../utils/node-credential-crypto.js";
import type { Node, NodeCredential } from "@prisma/client";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      agentNode?: Node & { credential: NodeCredential | null };
    }
  }
}

// Per CLOUDN_AGENT_INTEGRATION.md §2.1: every Agent→Panel call carries
// `Authorization: Bearer <CLOUDN_NODE_ID>.<CLOUDN_NODE_SECRET>`, checked
// with a constant-time comparison. Because the secret is stored as
// reversible ciphertext (see utils/node-credential-crypto.ts), the actual
// comparison is a constant-time byte comparison via
// crypto.timingSafeEqual on the decrypted value and the presented value —
// not a "does this hash match" check, since there's no hash anymore. The
// Node Secret itself is never echoed back in any response.
export async function requireNodeAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return fail(res, 401, "UNAUTHORIZED", "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) {
    return fail(res, 401, "INVALID_NODE_CREDENTIALS", "Malformed node credentials");
  }

  const nodeId = token.slice(0, separatorIndex);
  const presentedSecret = token.slice(separatorIndex + 1);

  const node = await prisma.node.findUnique({ where: { id: nodeId }, include: { credential: true } });
  if (!node || !node.credential) {
    return fail(res, 401, "INVALID_NODE_CREDENTIALS", "Node is unknown or disabled");
  }
  if (!node.isEnabled) {
    return fail(res, 401, "INVALID_NODE_CREDENTIALS", "Node is disabled");
  }

  let matches = false;
  try {
    const actualSecret = decryptSecret(node.credential.secretCiphertext);
    const a = Buffer.from(actualSecret);
    const b = Buffer.from(presentedSecret);
    matches = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    matches = false; // corrupt/undecryptable ciphertext is treated as a mismatch, not a crash
  }

  if (!matches) {
    return fail(res, 401, "INVALID_NODE_CREDENTIALS", "Node ID/secret mismatch");
  }

  req.agentNode = node;
  next();
}
