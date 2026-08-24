import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { authRouter } from "./routes/auth.routes.js";
import { usersRouter } from "./routes/users.routes.js";
import { locationsRouter } from "./routes/locations.routes.js";
import { nodesRouter } from "./routes/nodes.routes.js";
import { allocationsRouter } from "./routes/allocations.routes.js";
import { plansRouter } from "./routes/plans.routes.js";
import { nestsRouter } from "./routes/nests.routes.js";
import { eggsRouter } from "./routes/eggs.routes.js";
import { serversRouter } from "./routes/servers.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { logsRouter } from "./routes/logs.routes.js";
import { agentRouter } from "./routes/agent.routes.js";
import { fail, ErrorCodes } from "./utils/response.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Web and API are deployed as two SEPARATE origins (two separate Vercel
  // projects, or any other split hosting) — this is not a same-origin
  // setup, so CORS has to be explicit and correct, not permissive-by-
  // default. WEB_URL must be the exact origin(s) the frontend is served
  // from (comma-separated if there's more than one, e.g. a preview URL
  // alongside production) — "origin: true" (reflect any origin) is NOT
  // safe here because credentials:true cookies would then be sent
  // cross-site to whatever origin asked, not just your own frontend.
  const allowedOrigins = (process.env.WEB_URL ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header at all (server-to-server calls, curl, the
        // Agent's own requests) — nothing to check against, allow it.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/api/v1/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" }, error: null });
  });

  app.use("/api/v1/auth", authLimiter, authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/locations", locationsRouter);
  app.use("/api/v1/nodes", nodesRouter);
  app.use("/api/v1/allocations", allocationsRouter);
  app.use("/api/v1/plans", plansRouter);
  app.use("/api/v1/nests", nestsRouter);
  app.use("/api/v1/eggs", eggsRouter);
  app.use("/api/v1/servers", serversRouter);
  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/v1/logs", logsRouter);

  // Real receiving endpoints for the future CloudN Agent (see
  // docs/CLOUDN_AGENT_INTEGRATION.md §4-§6 and routes/agent.routes.ts).
  // The Agent itself doesn't exist yet, but this side of the contract —
  // node registration, heartbeat, and event ingestion — is implemented
  // for real, authenticated via Node ID + Node Secret rather than a user
  // session.
  app.use("/api/v1/agent", agentRouter);

  // Unknown /api/* routes are a real 404, not the SPA.
  app.use("/api", (_req, res) => {
    fail(res, 404, ErrorCodes.NOT_FOUND, "Route not found");
  });

  // Optional self-hosted single-process mode (Docker/VPS, NOT the Vercel
  // path — Vercel deploys web and api as two separate projects/origins,
  // see the split vercel.json files and the Deployment section in
  // README.md). Only kicks in if apps/web/dist was explicitly copied into
  // apps/api/public via `npm run build:selfhosted`; otherwise this block
  // is a no-op and the API serves /api/* only, exactly as it does on
  // Vercel.
  const staticDir = path.resolve(__dirname, "../public");
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    fail(res, 500, ErrorCodes.INTERNAL, "Internal server error");
  });

  return app;
}
