import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Flag, MessageSquare, MoreHorizontal, Pin, Trash2 } from 'lucide-react'
import { Avatar, Button, Card, Modal, StoredImage, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { ReportDialog } from '@/features/safety/safety'
import { reactionKinds, setReaction, timeAgo, useInvalidateFeed, type Post, type ReactionKind } from './api'

export function PostCard({
  post,
  linkToDetail = true,
  variant = 'card',
}: {
  post: Post
  linkToDetail?: boolean
  variant?: 'card' | 'timeline'
}) {
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
  const pin = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_post_pinned', { post_id: post.id, pinned: !post.pinned_at })
      if (error) throw error
    },
    onSuccess: async () => {
      setMenu(false)
      toast(post.pinned_at ? 'Publicación desfijada' : 'Publicación fijada arriba del muro')
      await invalidate(post.id)
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('posts').delete().eq('id', post.id)
      if (error) throw error
      // Best effort: remove the photo file too (the post row is already gone).
      if (post.image_path) await supabase.storage.from('media').remove([post.image_path])
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

  const reactionsRow = reactionKinds.map(({ kind, emoji, label }) => {
    const n = counts.get(kind) ?? 0
    const active = current === kind
    return (
      <button
        key={kind}
        onClick={() => react.mutate(kind)}
        aria-pressed={active}
        aria-label={`${label}${n ? ` (${n})` : ''}`}
        title={label}
        className={cn(
          'inline-flex h-8 items-center gap-1 rounded-full px-2 text-sm transition-all active:scale-90',
          active ? 'bg-primary-soft font-bold text-primary-soft-text' : 'text-muted hover:bg-surface-muted',
          !n && !active && 'opacity-60 grayscale-[35%]',
        )}
      >
        <span aria-hidden>{emoji}</span>
        {n > 0 && <span className="tabular-nums">{n}</span>}
      </button>
    )
  })

  const dialogs = (
    <>
      <Modal open={menu} onClose={() => setMenu(false)} title="Publicación">
        {me.is_moderator && (
          <Button variant="soft" block className="mb-2 justify-start" icon={<Pin size={18} />} loading={pin.isPending} onClick={() => pin.mutate()}>
            {post.pinned_at ? 'Desfijar del muro' : 'Fijar arriba del muro'}
          </Button>
        )}
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
    </>
  )

  // Home timeline: Twitter-like row — avatar on the left, everything else beside it.
  if (variant === 'timeline')
    return (
      <article className="flex gap-3 px-4 pb-2 pt-3.5 transition-colors hover:bg-surface-muted/40">
        <Link to={authorLink} className="shrink-0">
          <Avatar path={post.author?.avatar_path} name={post.author?.display_name} size="md" />
        </Link>
        <div className="min-w-0 flex-1">
          {post.pinned_at && <p className="mb-0.5 text-xs font-bold text-primary-text">📌 Fijado por el equipo</p>}
          <div className="flex items-center gap-1">
            <p className="flex min-w-0 flex-1 items-baseline gap-1 text-[15px]">
              <Link to={authorLink} className="max-w-[70%] shrink-0 truncate font-bold hover:underline">
                {post.author?.display_name}
              </Link>
              <span className="min-w-0 truncate text-muted">@{post.author?.username}</span>
              <span className="shrink-0 text-muted">· {timeAgo(post.created_at)}</span>
            </p>
            <button onClick={() => setMenu(true)} className="-mr-2 -mt-1 shrink-0 rounded-full p-1.5 text-muted hover:bg-surface-muted" aria-label="Opciones">
              <MoreHorizontal size={18} />
            </button>
          </div>
          {post.body.trim() && (
            <Link to={`/posts/${post.id}`} className="mt-0.5 block whitespace-pre-wrap break-words text-[15px] leading-normal">
              {post.body}
            </Link>
          )}
          {post.image_path && (
            <Link to={`/posts/${post.id}`} className="mt-2.5 block overflow-hidden rounded-2xl border border-border">
              <StoredImage
                path={post.image_path}
                meta={post.image_meta}
                alt={post.body.trim() ? post.body.slice(0, 80) : `Foto de ${post.author?.display_name ?? 'un miembro'}`}
                maxHeight={520}
              />
            </Link>
          )}
          <div className="-ml-2 mt-1.5 flex items-center gap-0.5">
            <Link
              to={`/posts/${post.id}`}
              className="mr-auto inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-sm text-muted hover:bg-primary-soft hover:text-primary-text"
              aria-label={`Comentar${commentCount ? ` (${commentCount})` : ''}`}
            >
              <MessageSquare size={17} /> {commentCount > 0 && <span className="tabular-nums">{commentCount}</span>}
            </Link>
            {reactionsRow}
          </div>
        </div>
        {dialogs}
      </article>
    )

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
          <p className="truncate text-xs text-muted">
            @{post.author?.username}
            {post.pinned_at && <span className="ml-2 font-semibold text-primary-text">📌 Fijado</span>}
          </p>
        </div>
        <button onClick={() => setMenu(true)} className="-mr-1 rounded-full p-1.5 text-muted hover:bg-surface-muted" aria-label="Opciones">
          <MoreHorizontal size={18} />
        </button>
      </div>

      {post.body.trim() &&
        (linkToDetail ? (
          <Link to={`/posts/${post.id}`} className="mt-3 block whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {post.body}
          </Link>
        ) : (
          <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{post.body}</p>
        ))}
      {post.image_path && (
        <StoredImage
          path={post.image_path}
          meta={post.image_meta}
          alt={post.body.trim() ? post.body.slice(0, 80) : `Foto de ${post.author?.display_name ?? 'un miembro'}`}
          className="mt-3 rounded-2xl"
          maxHeight={480}
        />
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
      {dialogs}
    </Card>
  )
}
