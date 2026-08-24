// Vercel serverless entrypoint for the API as its OWN Vercel project
// (Root Directory = apps/api in the Vercel dashboard). This project is
// deployed completely separately from apps/web — different Vercel
// project, different domain/origin — per the split-hosting setup: web on
// one Vercel deployment, API on another. See ../vercel.json for the
// rewrite that routes every request here, and ../../../README.md's
// Deployment section for the full picture (CORS, cookies, env vars).
import { createApp } from "../src/app.js";

const app = createApp();

export default app;
