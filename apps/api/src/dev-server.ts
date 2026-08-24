import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { createApp } from "./app.js";

// Single-port dev server: the same Express app used in production
// (createApp, mounted at /api/*) runs here too, but instead of serving a
// pre-built apps/web/dist, it runs Vite in middleware mode against
// apps/web's source directly — full HMR, no separate dev port, no proxy
// config to keep in sync. This is the dev-time equivalent of what
// `npm run build` + `npm start` does for production: one process, one
// port, one origin. `npm run dev:api-only` still exists if you want the
// API alone (e.g. developing against a separately-run frontend).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../web");

async function main() {
  const app = createApp();

  const vite = await createViteServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: "custom",
  });

  // Express routes (including the /api/* 404 handler) are already
  // registered by createApp(), so only requests that fall through
  // unmatched — i.e. actual frontend routes — reach Vite from here.
  app.use(vite.middlewares);

  // Vite's middleware mode doesn't serve index.html itself (appType:
  // "custom"), so the SPA fallback is explicit: transform the source
  // index.html (injecting HMR client, resolving /src/main.tsx, etc.) and
  // send it for any remaining GET request. This mirrors what the
  // production static-file fallback in app.ts does with the built file.
  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      let template = fs.readFileSync(path.join(webRoot, "index.html"), "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    console.log(`CloudN (web + API) listening on http://localhost:${port}`);
  });
}

main();
