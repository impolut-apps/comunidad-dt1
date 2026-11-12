import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Camera, Image as ImageIcon, Sparkles, UsersRound, Wand2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { compressImage, MAX_PHOTO_INPUT_BYTES, newFileId, uploadMedia } from '@/lib/media'
import { Avatar, Button, Card, CardSkeleton, EmptyState, ErrorState, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { useInterests, useUserInterests } from '@/features/profiles/shared'
import { PostCard } from './PostCard'
import { postSelect, useInvalidateFeed, type Post } from './api'

const PAGE = 20
const MAX = 2000

type FeedTab = 'all' | 'connections'

/**
 * Home is the timeline (Twitter-like): what people are posting, newest first, nothing else.
 * Plans, people, communities and groups live in Descubrir.
 */
export function HomePage() {
  const me = useMe()
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<FeedTab>('all')

  // "Conexiones": only people I'm connected with (accepted both ways).
  const connections = useQuery({
    queryKey: ['my-connections', me.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('connections').select('requester_id, addressee_id').eq('status', 'accepted')
      if (error) throw error
      return data.map((c) => (c.requester_id === me.id ? c.addressee_id : c.requester_id)) as string[]
    },
  })
  const authorIds = tab === 'connections' ? connections.data : undefined

  const feed = useInfiniteQuery({
    queryKey: ['feed', tab, authorIds?.length ?? 0],
    enabled: tab === 'all' || connections.isSuccess,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (authorIds && authorIds.length === 0) return [] as Post[]
      // Chronological on purpose — no ranking algorithm.
      let q = supabase.from('posts').select(postSelect).is('pinned_at', null)
      if (authorIds) q = q.in('author_id', authorIds)
      const { data, error } = await q.order('created_at', { ascending: false }).range(pageParam, pageParam + PAGE - 1)
      if (error) throw error
      return data as unknown as Post[]
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  })
  // Team announcements pinned by moderators sit above the chronological feed.
  const pinned = useQuery({
    queryKey: ['feed', 'pinned'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(postSelect)
        .not('pinned_at', 'is', null)
        .order('pinned_at', { ascending: false })
        .limit(3)
      if (error) throw error
      return data as unknown as Post[]
    },
  })
  const posts = feed.data?.pages.flat() ?? []
  const iHavePosted = tab === 'all' && posts.some((p) => p.author_id === me.id)

  // Shortcuts elsewhere (e.g. the weekly question in Descubrir) arrive with text for the composer.
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null)
  const incoming = (location.state as { prefill?: string } | null)?.prefill
  useEffect(() => {
    if (!incoming) return
    setPrefill((p) => ({ text: incoming, n: (p?.n ?? 0) + 1 }))
    navigate(location.pathname, { replace: true, state: null })
  }, [incoming, navigate, location.pathname])

  const showPinned = tab === 'all' && (pinned.data?.length ?? 0) > 0

  return (
    <div>
      <header className="mb-3 pr-14 lg:pr-0">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Inicio</h1>
      </header>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 border-b border-border" role="tablist" aria-label="Qué ver">
          {(
            [
              ['all', 'Para ti'],
              ['connections', 'Conexiones'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                'relative h-12 text-[15px] font-bold transition-colors hover:bg-surface-muted',
                tab === value ? 'text-text' : 'text-muted',
              )}
            >
              {label}
              {tab === value && <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-14 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        <div className="border-b border-border">
          <Composer intro={feed.isSuccess && tab === 'all' && !iHavePosted} prefill={prefill} />
        </div>

        {showPinned && (
          <ul className="divide-y divide-border border-b border-border bg-primary-soft/25">
            {pinned.data!.map((p) => (
              <li key={p.id}>
                <PostCard post={p} variant="timeline" />
              </li>
            ))}
          </ul>
        )}

        {feed.isPending ? (
          <div className="space-y-3 p-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : feed.isError ? (
          <div className="p-4">
            <ErrorState message="No hemos podido cargar las publicaciones." onRetry={() => feed.refetch()} />
          </div>
        ) : posts.length === 0 ? (
          tab === 'connections' ? (
            <EmptyState
              icon={<UsersRound size={28} />}
              title={connections.data?.length ? 'Tus conexiones aún no han publicado' : 'Aún no tienes conexiones'}
              action={
                <Link to="/discover" className="font-semibold text-primary-text">
                  Descubrir gente
                </Link>
              }
            >
              Aquí verás solo lo que publican las personas con las que conectas.
            </EmptyState>
          ) : (
            !showPinned && (
              <EmptyState icon={<Sparkles size={28} />} title="Sé la primera persona en publicar">
                Cuenta algo de tu día, haz una pregunta o preséntate. La comunidad empieza contigo.
              </EmptyState>
            )
          )
        ) : (
          <>
            <ul className="divide-y divide-border">
              {posts.map((p) => (
                <li key={p.id}>
                  <PostCard post={p} variant="timeline" />
                </li>
              ))}
            </ul>
            {feed.hasNextPage && (
              <div className="flex justify-center border-t border-border p-3">
                <Button variant="ghost" loading={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
                  Ver más
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function Composer({ intro, prefill }: { intro: boolean; prefill: { text: string; n: number } | null }) {
  const me = useMe()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const allInterests = useInterests()
  const myInterests = useUserInterests(intro ? me.id : undefined)
  const toast = useToast()
  const invalidate = useInvalidateFeed()
  const [body, setBody] = useState('')
  const [focused, setFocused] = useState(false)
  const [sending, setSending] = useState(false)
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const expanded = focused || body.length > 0 || photo !== null

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])

  useEffect(() => {
    if (prefill) fill(prefill.text)
  }, [prefill])

  /** Put text in the composer and select the first "___" blank so the member just types over it. */
  function fill(text: string) {
    setBody(text)
    setFocused(true)
    requestAnimationFrame(() => {
      const el = textarea.current
      if (!el) return
      el.focus({ preventScroll: true })
      const blank = text.indexOf('___')
      if (blank >= 0) el.setSelectionRange(blank, blank + 3)
      else el.setSelectionRange(text.length, text.length)
    })
  }

  function introTemplate() {
    const names = (allInterests.data ?? [])
      .filter((i) => myInterests.data?.includes(i.id))
      .slice(0, 3)
      .map((i) => i.label_es.toLowerCase())
    const likes = names.length ? names.join(', ').replace(/, ([^,]*)$/, ' y $1') : '___'
    const first = me.display_name?.split(' ')[0] ?? ''
    fill(`👋 ¡Hola! Soy ${first}, de ${me.city}. Me gusta ${likes}, y me encantaría conocer gente para ___`)
  }

  function pickPhoto(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Ese archivo no es una imagen', 'error')
    if (file.size > MAX_PHOTO_INPUT_BYTES) return toast('La foto es demasiado grande', 'error')
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  function reset() {
    setBody('')
    setPhoto(null)
    setFocused(false)
  }

  async function publish() {
    const text = body.trim()
    if (!text && !photo) return
    setSending(true)
    try {
      let image_path: string | null = null
      let image_meta = null
      if (photo) {
        const { blob, meta } = await compressImage(photo.file)
        image_path = await uploadMedia(`posts/${me.id}/${newFileId()}.webp`, blob, 'image/webp')
        image_meta = meta
      }
      const { error } = await supabase.from('posts').insert({ author_id: me.id, body: text, image_path, image_meta })
      if (error) {
        if (image_path) await supabase.storage.from('media').remove([image_path])
        throw error
      }
      reset()
      await invalidate()
      toast('Publicado')
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="px-4 pb-3 pt-3.5">
      <div className="flex gap-3">
        <Avatar path={me.avatar_path} name={me.display_name} size="md" />
        <div className="min-w-0 flex-1">
          <textarea
            ref={textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setFocused(true)}
            maxLength={MAX}
            rows={expanded ? 4 : 1}
            placeholder={intro ? 'Preséntate: ¿de dónde eres, qué te gusta hacer?' : '¿Qué está pasando?'}
            aria-label="Nueva publicación"
            className="w-full resize-none bg-transparent py-2.5 text-lg leading-snug placeholder:text-muted focus:outline-none"
          />
          {intro && !body && !photo && (
            <button
              onClick={introTemplate}
              className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary-soft-text transition hover:brightness-95"
            >
              <Wand2 size={15} /> Usar plantilla de presentación
            </button>
          )}
          {photo && (
            <div className="relative mt-2 overflow-hidden rounded-2xl bg-surface-muted">
              <img src={photo.url} alt="Foto que vas a publicar" className="max-h-80 w-full object-contain" />
              <button
                onClick={() => setPhoto(null)}
                className="absolute right-2 top-2 rounded-full bg-midnight/70 p-1.5 text-white"
                aria-label="Quitar foto"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className={cn('flex items-center gap-1', expanded ? 'mt-2 border-t border-border pt-3' : 'mt-1')}>
            <button
              onClick={() => cameraInput.current?.click()}
              className="rounded-full p-2 text-primary-text hover:bg-primary-soft"
              aria-label="Hacer una foto"
            >
              <Camera size={20} />
            </button>
            <button
              onClick={() => galleryInput.current?.click()}
              className="rounded-full p-2 text-primary-text hover:bg-primary-soft"
              aria-label="Elegir foto de la galería"
            >
              <ImageIcon size={20} />
            </button>
            {expanded && (
              <span className="ml-1 hidden flex-1 text-xs text-muted sm:block">
                Aquí no damos consejo médico. {body.length > MAX - 200 && `${body.length}/${MAX}`}
              </span>
            )}
            <div className="ml-auto flex gap-2">
              {expanded && (
                <Button variant="ghost" size="sm" onClick={reset} disabled={sending}>
                  Cancelar
                </Button>
              )}
              <Button size="sm" loading={sending} disabled={!body.trim() && !photo} onClick={publish}>
                Publicar
              </Button>
            </div>
          </div>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (pickPhoto(e.target.files?.[0]), (e.target.value = ''))} />
          <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => (pickPhoto(e.target.files?.[0]), (e.target.value = ''))} />
        </div>
      </div>
    </div>
  )
}

