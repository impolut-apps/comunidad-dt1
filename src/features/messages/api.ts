import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface InboxItem {
  conversation_id: string
  other_user_id: string
  last_message_at: string | null
  last_message_body: string | null
  last_message_sender: string | null
  unread_count: number
  other: { id: string; username: string; display_name: string; avatar_path: string | null } | null
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

/** Inbox with unread counts; the other person's profile is joined client-side (RLS hides blocked people). */
export function useInbox(enabled = true) {
  return useQuery({
    queryKey: ['inbox'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_conversations')
      if (error) throw error
      const rows = data as Omit<InboxItem, 'other'>[]
      const ids = [...new Set(rows.map((r) => r.other_user_id))]
      const { data: profiles, error: pErr } = ids.length
        ? await supabase.from('profiles').select('id, username, display_name, avatar_path').in('id', ids)
        : { data: [], error: null }
      if (pErr) throw pErr
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
      return rows.map((r) => ({ ...r, unread_count: Number(r.unread_count), other: byId.get(r.other_user_id) ?? null })) as InboxItem[]
    },
  })
}

/**
 * One app-wide realtime subscription. Postgres changes are filtered by RLS,
 * so each person only receives messages from their own conversations.
 */
export function useMessagesRealtime(userId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel(`messages-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message
        qc.setQueryData<Message[]>(['messages', m.conversation_id], (old) =>
          old && !old.some((x) => x.id === m.id) ? [...old, m] : old,
        )
        void qc.invalidateQueries({ queryKey: ['inbox'] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])
}

const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const longDayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

export function shortTime(iso: string) {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dayFmt.format(d)
}
export const clock = (iso: string) => timeFmt.format(new Date(iso))
export function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return longDayFmt.format(d)
}
