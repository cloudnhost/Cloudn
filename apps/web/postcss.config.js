import path from "node:path";
import { fileURLToPath } from "node:url";

// Tailwind's PostCSS plugin auto-discovers tailwind.config.js relative to
// process.cwd() by default — NOT relative to this file or to Vite's
// configured root. That's a problem in this monorepo: when the frontend
// runs standalone (`npm run dev:web`), npm sets cwd to apps/web and
// discovery works by accident. But when Vite runs in middleware mode from
// inside the API process (`npm run dev`, apps/api/src/dev-server.ts),
// cwd is apps/api, Tailwind can't find this directory's config, and it
// silently falls back to zero custom theme — every `bg-base-*`,
// `accent-*`, etc. utility "doesn't exist" even though the file is
// correct. Passing an explicit, cwd-independent absolute path removes the
// ambiguity entirely, so this works the same regardless of which process
// (or which OS, or which cwd) started Vite.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.resolve(__dirname, "tailwind.config.js") },
    autoprefixer: {},
  },
};
