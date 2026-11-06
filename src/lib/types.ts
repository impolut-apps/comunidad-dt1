// Domain types mirroring supabase/migrations. Regenerate full DB types with
// `npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts` once linked.

export type AgeRange = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+'

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_path: string | null
  bio: string | null
  country: string | null
  city: string | null
  age_range: AgeRange | null
  t1d_since: number | null
  t1d_note: string | null
  is_moderator: boolean
  status: 'active' | 'suspended'
  onboarded_at: string | null
  created_at: string
}

export interface Interest {
  id: number
  slug: string
  label_es: string
  label_en: string
  emoji: string
  sort_order: number
}
