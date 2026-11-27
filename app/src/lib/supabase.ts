import { createClient } from "@supabase/supabase-js";

// Browser client. Uses only the public publishable key; Row Level Security
// in the database decides what each logged-in user may see or change.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);