import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// Single browser client. RLS enforces the private layer at the row level —
// private topics never leave the database for non-Paul sessions.
export const supabase = createClient(
  url ?? "http://localhost:54321",
  anonKey ?? "unconfigured",
);
