// Mockup access gate. This is NOT real authentication — it's a shared code
// checked server-side, enough to demo the backend. Replace with real auth
// (e.g. Supabase Auth + Google) before handling real client data.
export const AUTH_COOKIE = "wadr_session";

export function getAccessCode(): string {
  return process.env.BACKEND_ACCESS_CODE || "186730";
}

// Only these people may enter the backend (matched case-insensitively, with
// surrounding whitespace ignored), in addition to the access code.
export const ALLOWED_NAMES = ["Yari Corsino", "Isa Abdur-Rahman"];

export function isAllowedName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return ALLOWED_NAMES.some((n) => n.toLowerCase() === normalized);
}
