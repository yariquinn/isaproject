import { createClient } from "@supabase/supabase-js";

// Public Supabase config. These NEXT_PUBLIC_ values are embedded in the client
// bundle by design — the publishable/anon key is meant to be public, and Row
// Level Security is what protects the data. Env vars override the inlined
// fallbacks so the build is self-sufficient in any environment.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://wppgoukszayomglouwyq.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_-5FP42cHrsN_5aIrCsXo3Q_UjjokROE";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
