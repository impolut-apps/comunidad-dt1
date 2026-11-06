import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'

export function GroupIcon({ emoji, size = 'md' }: { emoji: string | null; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl bg-primary-soft',
        size === 'md' ? 'size-12 text-2xl' : 'size-10 text-xl',
      )}
      aria-hidden
    >
      {emoji ?? '💬'}
    </span>
  )
}

export function useJoinGroup(groupId: string) {
  const me = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('conversation_participants').insert({ conversation_id: groupId, user_id: me.id })
      if (error && !/duplicate key/.test(error.message)) throw error
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['groups'] }),
        qc.invalidateQueries({ queryKey: ['messages', groupId] }),
      ]),
    onError: (e) => toast(friendlyError(e), 'error'),
  })
}
