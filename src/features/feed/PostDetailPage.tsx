import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FileX, Flag, SendHorizontal, Trash2 } from 'lucide-react'
import { Avatar, Card, CardSkeleton, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { ReportDialog } from '@/features/safety/safety'
import { PostCard } from './PostCard'
import { commentSelect, postSelect, timeAgo, type Comment, type Post } from './api'

export function PostDetailPage() {
  const { id } = useParams()
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [reportId, setReportId] = useState<string | null>(null)

  const post = useQuery({
    queryKey: ['post', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('posts').select(postSelect).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as unknown as Post | null
    },
  })
  const comments = useQuery({
    queryKey: ['comments', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('comments').select(commentSelect).eq('post_id', id!).order('created_at')
      if (error) throw error
      return data as unknown as Comment[]
    },
  })
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['comments', id] }),
      qc.invalidateQueries({ queryKey: ['post', id] }),
      qc.invalidateQueries({ queryKey: ['feed'] }),
    ])

  const add = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.from('comments').insert({ post_id: id, author_id: me.id, body: text })
      if (error) throw error
    },
    onSuccess: () => {
      setBody('')
      void refresh()
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })
  const remove = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from('comments').delete().eq('id', commentId)
      if (error) throw error
    },
    onSuccess: () => {
      toast('Comentario eliminado')
      void refresh()
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (text) add.mutate(text)
  }

  if (post.isPending) return <CardSkeleton />
  if (post.isError) return <ErrorState message="No hemos podido cargar la publicación." onRetry={() => post.refetch()} />
  if (!post.data)
    return (
      <EmptyState icon={<FileX size={28} />} title="Publicación no disponible" action={<Link to="/home" className="font-semibold text-primary-text">Volver al inicio</Link>}>
        Puede que se haya borrado o que no esté disponible.
      </EmptyState>
    )

  const isPostAuthor = post.data.author_id === me.id

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
        <ArrowLeft size={22} />
      </button>
      <PostCard post={post.data} linkToDetail={false} />

      <Card className="p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Comentarios</h2>
        {comments.isPending ? (
          <div className="flex justify-center py-6 text-primary-text">
            <Spinner />
          </div>
        ) : comments.isError ? (
          <div className="mt-3">
            <ErrorState message="No hemos podido cargar los comentarios." onRetry={() => comments.refetch()} />
          </div>
        ) : comments.data.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-muted">Todavía no hay comentarios. ¡Di algo bonito!</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {comments.data.map((c) => {
              const mine = c.author_id === me.id
              return (
                <li key={c.id} className="group flex gap-3">
                  <Link to={mine ? '/profile' : `/u/${c.author?.username}`}>
                    <Avatar path={c.author?.avatar_path} name={c.author?.display_name} size="xs" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-2xl bg-surface-muted px-3.5 py-2.5">
                      <p className="text-sm font-bold">{c.author?.display_name}</p>
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{c.body}</p>
                    </div>
                    <div className="mt-1 flex gap-3 px-1 text-xs text-muted">
                      <span>{timeAgo(c.created_at)}</span>
                      {(mine || isPostAuthor) && (
                        <button onClick={() => remove.mutate(c.id)} className="inline-flex items-center gap-1 font-semibold hover:text-danger">
                          <Trash2 size={12} /> Eliminar
                        </button>
                      )}
                      {!mine && (
                        <button onClick={() => setReportId(c.id)} className="inline-flex items-center gap-1 font-semibold hover:text-danger">
                          <Flag size={12} /> Reportar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <form onSubmit={submit} className="mt-4 flex items-end gap-2 border-t border-border pt-4">
          <Avatar path={me.avatar_path} name={me.display_name} size="xs" />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
            }}
            rows={1}
            maxLength={1000}
            placeholder="Escribe un comentario…"
            aria-label="Comentario"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-bg px-3.5 py-2 text-[15px] focus:border-electric focus:outline-none focus:ring-4 focus:ring-electric/15"
          />
          <button
            type="submit"
            disabled={!body.trim() || add.isPending}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95 disabled:opacity-40"
            aria-label="Enviar comentario"
          >
            {add.isPending ? <Spinner size={16} /> : <SendHorizontal size={18} />}
          </button>
        </form>
      </Card>
      {reportId && <ReportDialog open onClose={() => setReportId(null)} targetType="comment" targetId={reportId} />}
    </div>
  )
}
