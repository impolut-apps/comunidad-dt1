// Deletes the calling user's account and all their data (GDPR right to erasure).
// The service-role key exists only here, as a Supabase secret — never in the frontend.
// Deploy: npx supabase functions deploy delete-account
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Identify the caller from their own JWT.
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Remove avatar files first (storage is not covered by the database cascade).
  const { data: files } = await admin.storage.from('avatars').list(user.id)
  if (files?.length) await admin.storage.from('avatars').remove(files.map((f) => `${user.id}/${f.name}`))

  // Deleting the auth user cascades to profile, posts, plans, messages, etc.
  const { error: delError } = await admin.auth.admin.deleteUser(user.id)
  if (delError) return new Response(JSON.stringify({ error: 'delete_failed' }), { status: 500, headers: cors })

  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
