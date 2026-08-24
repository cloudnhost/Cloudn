// Thin fetch wrapper around the CloudN API. All requests send cookies
// (httpOnly session cookie) and unwrap the { success, data, error } shape.

// Web and API are two separate origins in this deployment (two separate
// Vercel projects) — there's no same-origin "/api/v1/..." to fall back
// to in production, so the base URL is explicit and required there. In
// local dev it defaults to the API's default port so `npm run dev`
// (which starts both apps/api and apps/web as separate processes) works
// with zero config out of the box.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    // Required for the cross-site session cookie to be sent/received —
    // see apps/api/src/routes/auth.routes.ts's cookieOpts for the
    // matching SameSite=None; Secure configuration this depends on.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const json = await res.json().catch(() => null);

  if (!json || !json.success) {
    const code = json?.error?.code ?? "INTERNAL";
    const message = json?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, code, message);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
