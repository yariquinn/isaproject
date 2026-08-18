// Mockup access gate. This is NOT real authentication — it's a shared code
// checked server-side, enough to demo the backend. Replace with real auth
// (e.g. Supabase Auth + Google) before handling real client data.
export const AUTH_COOKIE = "wadr_session";

export function getAccessCode(): string {
  return process.env.BACKEND_ACCESS_CODE || "186730";
}
