import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type NotificationType = 'connection_request' | 'connection_accepted' | 'activity_joined' | 'post_comment'

export interface AppNotification {
  id: string
  type: NotificationType
  entity_id: string | null
  created_at: string
  read_at: string | null
  actor: { id: string; username: string; display_name: string; avatar_path: string | null } | null
}

export function useUnreadNotifications(userId: string) {
  return useQuery({
    queryKey: ['notifications-unread', userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

/** Notifications are inserted by database triggers; realtime delivers them only to their owner (RLS). */
export function useNotificationsRealtime(userId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] })
        void qc.invalidateQueries({ queryKey: ['notifications-unread'] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])
}
