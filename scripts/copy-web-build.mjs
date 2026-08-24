// Copies the built frontend into apps/api/public so a single `node
// apps/api/dist/index.js` process can serve both the SPA and /api/* on one
// origin — the "single public origin" requirement for self-hosted (non-
// Vercel) deployments. On Vercel this script is not part of the build
// (see vercel.json), since Vercel serves the static output directly.
import { cp, rm, existsSync } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cpAsync = promisify(cp);
const rmAsync = promisify(rm);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "apps/web/dist");
const dest = path.join(root, "apps/api/public");

if (!existsSync(src)) {
  console.error("apps/web/dist not found — run `npm run build:web` first.");
  process.exit(1);
}

await rmAsync(dest, { recursive: true, force: true });
await cpAsync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
