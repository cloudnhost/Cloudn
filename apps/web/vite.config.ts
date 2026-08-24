import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Web and API run as two independent processes/origins (mirroring the
// split Vercel deployment — see apps/web/vercel.json and
// apps/api/vercel.json). The frontend talks to the API via an absolute
// URL (VITE_API_URL, see src/lib/api.ts), not a dev proxy, so this stays
// simple and matches production exactly rather than working differently
// in dev vs. deployed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
