import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type ReactionKind = 'heart' | 'hug' | 'strong' | 'laugh'
export const reactionKinds: Array<{ kind: ReactionKind; emoji: string; label: string }> = [
  { kind: 'heart', emoji: '💙', label: 'Me representa' },
  { kind: 'hug', emoji: '🤗', label: 'Te entiendo' },
  { kind: 'strong', emoji: '💪', label: 'Qué grande' },
  { kind: 'laugh', emoji: '😂', label: 'Jajaja' },
]

export interface Author {
  id: string
  username: string
  display_name: string
  avatar_path: string | null
}

export interface Post {
  id: string
  author_id: string
  body: string
  image_path: string | null
  image_meta: { w: number; h: number } | null
  pinned_at: string | null
  created_at: string
  author: Author | null
  reactions: Array<{ user_id: string; kind: ReactionKind }>
  comments: Array<{ count: number }>
}

export interface Comment {
  id: string
  post_id: string
  author_id: string
  body: string
  created_at: string
  author: Author | null
}

export const postSelect =
  '*, author:profiles!posts_author_id_fkey(id, username, display_name, avatar_path), reactions(user_id, kind), comments(count)'
export const commentSelect = '*, author:profiles!comments_author_id_fkey(id, username, display_name, avatar_path)'

export async function setReaction(postId: string, userId: string, kind: ReactionKind, current?: ReactionKind) {
  if (current === kind) {
    const { error } = await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('reactions')
      .upsert({ post_id: postId, user_id: userId, kind }, { onConflict: 'post_id,user_id' })
    if (error) throw error
  }
}

export function useInvalidateFeed() {
  const qc = useQueryClient()
  return (postId?: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['feed'] }),
      postId ? qc.invalidateQueries({ queryKey: ['post', postId] }) : null,
    ])
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'ahora'
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute')
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour')
  if (s < 7 * 86400) return rtf.format(-Math.floor(s / 86400), 'day')
  return dateFmt.format(new Date(iso))
}
