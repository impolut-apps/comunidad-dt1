import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ChevronRight, Sparkles } from 'lucide-react'
import { Avatar, Button, Card, CardSkeleton, EmptyState, ErrorState, PageHeader, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { activitySelect, formatWhen, type Activity } from '@/features/activities/api'
import { PostCard } from './PostCard'
import { postSelect, useInvalidateFeed, type Post } from './api'

const PAGE = 20
const MAX = 2000

export function HomePage() {
  const me = useMe()
  const feed = useInfiniteQuery({
    queryKey: ['feed'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      // Chronological on purpose — no ranking algorithm.
      const { data, error } = await supabase
        .from('posts')
        .select(postSelect)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE - 1)
      if (error) throw error
      return data as unknown as Post[]
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  })
  const posts = feed.data?.pages.flat() ?? []
  const iHavePosted = posts.some((p) => p.author_id === me.id)

  return (
    <div className="space-y-4">
      <PageHeader title={`Hola, ${me.display_name?.split(' ')[0]} 👋`} subtitle="Lo que está pasando en la comunidad" />
      <Composer intro={feed.isSuccess && !iHavePosted} />
      <UpcomingNearby />

      {feed.isPending ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : feed.isError ? (
        <ErrorState message="No hemos podido cargar las publicaciones." onRetry={() => feed.refetch()} />
      ) : posts.length === 0 ? (
        <EmptyState icon={<Sparkles size={28} />} title="Sé la primera persona en publicar">
          Cuenta algo de tu día, haz una pregunta o preséntate. La comunidad empieza contigo.
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
          {feed.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
                Ver más
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Composer({ intro }: { intro: boolean }) {
  const me = useMe()
  const toast = useToast()
  const invalidate = useInvalidateFeed()
  const [body, setBody] = useState('')
  const [focused, setFocused] = useState(false)
  const [sending, setSending] = useState(false)
  const expanded = focused || body.length > 0

  async function publish() {
    const text = body.trim()
    if (!text) return
    setSending(true)
    const { error } = await supabase.from('posts').insert({ author_id: me.id, body: text })
    setSending(false)
    if (error) return toast(friendlyError(error), 'error')
    setBody('')
    setFocused(false)
    await invalidate()
    toast('Publicado')
  }

  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Avatar path={me.avatar_path} name={me.display_name} size="sm" />
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setFocused(true)}
            maxLength={MAX}
            rows={expanded ? 4 : 1}
            placeholder={intro ? 'Preséntate: ¿de dónde eres, qué te gusta hacer?' : '¿Qué quieres compartir hoy?'}
            aria-label="Nueva publicación"
            className="w-full resize-none bg-transparent py-2 text-[15px] leading-relaxed placeholder:text-muted focus:outline-none"
          />
          {expanded && (
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted">
                Recuerda: aquí no damos consejo médico. {body.length > MAX - 200 && `${body.length}/${MAX}`}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBody('')
                    setFocused(false)
                  }}
                >
                  Cancelar
                </Button>
                <Button size="sm" loading={sending} disabled={!body.trim()} onClick={publish}>
                  Publicar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Small strip of upcoming plans in my city — makes the community feel alive. */
function UpcomingNearby() {
  const me = useMe()
  const plans = useQuery({
    queryKey: ['activities', 'home-strip'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select(activitySelect)
        .eq('status', 'open')
        .eq('country', me.country!)
        .eq('city_key', me.city!.trim().toLowerCase())
        .gt('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(3)
      if (error) throw error
      return data as unknown as Activity[]
    },
  })
  if (!plans.data?.length) return null
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Próximos planes en {me.city}</h2>
        <Link to="/plans" className="inline-flex items-center text-sm font-semibold text-primary-text">
          Ver todos <ChevronRight size={16} />
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {plans.data.map((a) => (
          <li key={a.id}>
            <Link to={`/plans/${a.id}`} className="flex items-center gap-3 py-2.5">
              <span className="text-xl" aria-hidden>
                {a.interest?.emoji ?? '📅'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.title}</span>
                <span className="block text-sm text-muted">{formatWhen(a.starts_at)}</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
