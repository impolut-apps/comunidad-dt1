import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT-REF'))

// Only the public anon key is ever used in the browser. All permissions are enforced by RLS.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})

export const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin
