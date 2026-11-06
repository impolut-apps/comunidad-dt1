import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Flag, MessageSquare, MoreHorizontal, Trash2 } from 'lucide-react'
import { Avatar, Button, Card, Modal, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { ReportDialog } from '@/features/safety/safety'
import { reactionKinds, setReaction, timeAgo, useInvalidateFeed, type Post, type ReactionKind } from './api'

export function PostCard({ post, linkToDetail = true }: { post: Post; linkToDetail?: boolean }) {
  const me = useMe()
  const toast = useToast()
  const navigate = useNavigate()
  const invalidate = useInvalidateFeed()
  const [menu, setMenu] = useState(false)
  const [report, setReport] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mine = post.author_id === me.id
  const myReaction = post.reactions.find((r) => r.user_id === me.id)?.kind
  const commentCount = post.comments?.[0]?.count ?? 0

  // Optimistic local view of reactions so taps feel instant.
  const [optimistic, setOptimistic] = useState<{ kind?: ReactionKind } | null>(null)
  const current = optimistic ? optimistic.kind : myReaction
  const counts = new Map<ReactionKind, number>()
  for (const r of post.reactions) if (r.user_id !== me.id) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
  if (current) counts.set(current, (counts.get(current) ?? 0) + 1)

  const react = useMutation({
    mutationFn: (kind: ReactionKind) => setReaction(post.id, me.id, kind, current),
    onMutate: (kind) => setOptimistic({ kind: current === kind ? undefined : kind }),
    onError: (e) => {
      setOptimistic(null)
      toast(friendlyError(e), 'error')
    },
    onSettled: async () => {
      await invalidate(post.id)
      setOptimistic(null)
    },
  })
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('posts').delete().eq('id', post.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setConfirmDelete(false)
      toast('Publicación eliminada')
      await invalidate()
      if (!linkToDetail) navigate('/home', { replace: true })
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  const authorLink = mine ? '/profile' : `/u/${post.author?.username}`

  return (
    <Card className="p-4 animate-fade-up">
      <div className="flex items-start gap-3">
        <Link to={authorLink}>
          <Avatar path={post.author?.avatar_path} name={post.author?.display_name} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <Link to={authorLink} className="truncate font-bold hover:underline">
              {post.author?.display_name}
            </Link>
            <span className="shrink-0 text-sm text-muted">· {timeAgo(post.created_at)}</span>
          </div>
          <p className="truncate text-xs text-muted">@{post.author?.username}</p>
        </div>
        <button onClick={() => setMenu(true)} className="-mr-1 rounded-full p-1.5 text-muted hover:bg-surface-muted" aria-label="Opciones">
          <MoreHorizontal size={18} />
        </button>
      </div>

      {linkToDetail ? (
        <Link to={`/posts/${post.id}`} className="mt-3 block whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {post.body}
        </Link>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.body}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {reactionKinds.map(({ kind, emoji, label }) => {
          const n = counts.get(kind) ?? 0
          const active = current === kind
          return (
            <button
              key={kind}
              onClick={() => react.mutate(kind)}
              aria-pressed={active}
              aria-label={`${label}${n ? ` (${n})` : ''}`}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-sm transition-all active:scale-90',
                active ? 'border-primary bg-primary-soft font-bold text-primary-soft-text' : 'border-border text-muted hover:bg-surface-muted',
                !n && !active && 'opacity-70',
              )}
            >
              <span aria-hidden>{emoji}</span>
              {n > 0 && <span className="tabular-nums">{n}</span>}
            </button>
          )
        })}
        <Link
          to={`/posts/${post.id}`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-muted hover:bg-surface-muted"
        >
          <MessageSquare size={16} /> {commentCount > 0 ? commentCount : 'Comentar'}
        </Link>
      </div>

      <Modal open={menu} onClose={() => setMenu(false)} title="Publicación">
        {mine ? (
          <Button
            variant="danger"
            block
            className="justify-start"
            icon={<Trash2 size={18} />}
            onClick={() => {
              setMenu(false)
              setConfirmDelete(true)
            }}
          >
            Eliminar publicación
          </Button>
        ) : (
          <Button
            variant="secondary"
            block
            className="justify-start"
            icon={<Flag size={18} />}
            onClick={() => {
              setMenu(false)
              setReport(true)
            }}
          >
            Reportar publicación
          </Button>
        )}
      </Modal>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="¿Eliminar publicación?"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" block loading={remove.isPending} onClick={() => remove.mutate()}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">Se borrarán también sus comentarios y reacciones.</p>
      </Modal>
      {report && <ReportDialog open onClose={() => setReport(false)} targetType="post" targetId={post.id} />}
    </Card>
  )
}
