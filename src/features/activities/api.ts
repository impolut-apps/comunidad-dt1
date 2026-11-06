import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Activity {
  id: string
  organizer_id: string
  interest_id: number | null
  title: string
  description: string | null
  starts_at: string
  ends_at: string | null
  country: string
  city: string
  area_hint: string | null
  max_participants: number | null
  status: 'open' | 'cancelled'
  created_at: string
  organizer: { id: string; username: string; display_name: string; avatar_path: string | null } | null
  interest: { emoji: string; label_es: string } | null
  participants: Array<{ count: number }>
}

// Organizer and category embedded; participant count via PostgREST aggregate.
export const activitySelect =
  '*, organizer:profiles!activities_organizer_id_fkey(id, username, display_name, avatar_path), interest:interests(emoji, label_es), participants:activity_participants(count)'

export const participantCount = (a: Activity) => a.participants?.[0]?.count ?? 0
export const isFull = (a: Activity) => a.max_participants != null && participantCount(a) >= a.max_participants
export const isPast = (a: Activity) => new Date(a.starts_at) <= new Date()

/** Ids of plans I'm going to (including the ones I organize). */
export function useMyActivityIds(userId: string) {
  return useQuery({
    queryKey: ['my-activity-ids', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activity_participants').select('activity_id').eq('user_id', userId)
      if (error) throw error
      return new Set(data.map((r) => r.activity_id as string))
    },
  })
}

const dayFmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('es', { month: 'short' })

export function formatWhen(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const day = same(d, today) ? 'Hoy' : same(d, tomorrow) ? 'Mañana' : dayFmt.format(d)
  return `${day} · ${timeFmt.format(d)}`
}

export function dateBadge(iso: string) {
  const d = new Date(iso)
  return { day: d.getDate(), month: monthFmt.format(d).replace('.', '') }
}
