import { createClient } from '@supabase/supabase-js';

// Browser-side Supabase client — hanya menggunakan NEXT_PUBLIC keys
// Ini aman karena hanya menggunakan anon key yang memang public

let rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
rawUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const BROWSER_STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'file-hanswy';

export const isBrowserSupabaseReady = Boolean(
  rawUrl &&
  rawUrl.startsWith('https://') &&
  anonKey &&
  anonKey.length > 20
);

// Client untuk digunakan di browser (komponen React)
export const supabaseBrowser = isBrowserSupabaseReady
  ? createClient(rawUrl, anonKey, {
      auth: { persistSession: false },
    })
  : null;
