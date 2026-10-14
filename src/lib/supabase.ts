import { createClient } from '@supabase/supabase-js';

// Clean base URL to remove any trailing slashes or /rest/v1 paths
let rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
rawUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// If serviceKey starts with sb_secret_ (new management secret format), anonKey (JWT) is preferred for Supabase PostgREST
const effectiveKey = (serviceKey && serviceKey.startsWith('ey')) ? serviceKey : (anonKey || serviceKey);

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawUrl.startsWith('https://') &&
  effectiveKey &&
  effectiveKey.length > 20
);

export const supabase = isSupabaseConfigured
  ? createClient(rawUrl, effectiveKey, {
      auth: {
        persistSession: false,
      },
    })
  : null;

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'file-hanswy';
