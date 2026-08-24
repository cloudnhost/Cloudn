import { createApp } from "./app.js";

// Standalone Node entrypoint (self-hosted / Docker / any non-Vercel host).
// For Vercel, api/index.ts wraps createApp() as a serverless function
// instead of calling listen().
const app = createApp();
const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`CloudN API listening on :${port}`);
});
