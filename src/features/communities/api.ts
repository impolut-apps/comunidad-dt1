import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'

export interface Community {
  id: string
  slug: string
  name: string
  description: string | null
  emoji: string | null
  /** Set by the community's admin (host); in the avatars bucket. */
  photo_path: string | null
  host_id: string | null
  host_username: string | null
  host_name: string | null
  host_avatar: string | null
  member_count: number
  joined: boolean
  announcements_id: string
  chat_id: string
  last_announcement_at: string | null
  last_announcement_body: string | null
  last_chat_at: string | null
  last_chat_body: string | null
  last_chat_sender: string | null
  unread_announcements: number
  unread_chat: number
}

/** Every community (directory + mine). One small list, so screens filter it client-side. */
export function useCommunities(enabled = true) {
  return useQuery({
    queryKey: ['communities'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_communities')
      if (error) throw error
      return (data as Community[]).map((c) => ({
        ...c,
        member_count: Number(c.member_count),
        unread_announcements: Number(c.unread_announcements),
        unread_chat: Number(c.unread_chat),
      }))
    },
  })
}

export const communityUnread = (c: Community) => (c.joined ? c.unread_announcements + c.unread_chat : 0)

export function useJoinCommunity() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (c: Community) => {
      const { error } = await supabase.rpc('join_community', { p_community: c.id })
      if (error) throw error
      return c
    },
    onSuccess: (c) => {
      toast(`¡Bienvenida/o a ${c.name}!`)
      return qc.invalidateQueries({ queryKey: ['communities'] })
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })
}

export function useLeaveCommunity() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (c: Community) => {
      const { error } = await supabase.rpc('leave_community', { p_community: c.id })
      if (error) throw error
      return c
    },
    onSuccess: (c) => {
      qc.removeQueries({ queryKey: ['messages', c.announcements_id] })
      qc.removeQueries({ queryKey: ['messages', c.chat_id] })
      toast(`Has salido de ${c.name}`)
      return qc.invalidateQueries({ queryKey: ['communities'] })
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })
}

/** Soft, on-brand cover for a community, varied by its slug so each one feels its own. */
const covers = [
  ['#0E4FA3', '#4B91ED'],
  ['#142238', '#1268D5'],
  ['#0D6B5C', '#2BA58A'],
  ['#3B2E8F', '#7A6BE0'],
  ['#B4462A', '#F08A4B'],
]
export function communityCover(slug: string) {
  let h = 0
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [from, to] = covers[h % covers.length]
  return { background: `radial-gradient(circle at 85% 10%, #8ADCC355 0%, transparent 45%), linear-gradient(135deg, ${from} 0%, ${to} 100%)` }
}
