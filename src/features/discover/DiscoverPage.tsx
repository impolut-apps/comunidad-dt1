import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PeopleSuggestions } from '@/features/feed/PeopleSuggestions'
import { WeeklyQuestion } from '@/features/feed/WeeklyQuestion'
import { WelcomeCard } from '@/features/feed/WelcomeCard'
import { CommunitiesSection, GroupsSection, UpcomingNearby } from './sections'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { MapPin, Search, Share2, Sparkles, Users } from 'lucide-react'
import { Avatar, Button, CardSkeleton, Chip, EmptyState, ErrorState, Input, PageHeader, Tag, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { countryName } from '@/lib/geo'
import { brand } from '@/lib/brand'
import { cn } from '@/lib/cn'
import { useInterests, useUserInterests } from '@/features/profiles/shared'

const PAGE = 24
type Scope = 'city' | 'country' | 'all'

interface Person {
  id: string
  username: string
  display_name: string
  avatar_path: string | null
  bio: string | null
  country: string
  city: string
  t1d_since: number | null
  created_at: string
  shared_interests: number
  same_city: boolean
}

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function DiscoverPage() {
  const me = useMe()
  const toast = useToast()
  const navigate = useNavigate()
  const [scope, setScope] = useState<Scope>('city')
  const [interestFilter, setInterestFilter] = useState<number[]>([])
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const { data: interests } = useInterests()
  const { data: myInterestIds = [] } = useUserInterests(me.id)

  // A search looks across everyone; otherwise the scope decides.
  const effectiveScope: Scope = q ? 'all' : scope
  const params = {
    p_country: effectiveScope === 'all' ? null : me.country,
    p_city: effectiveScope === 'city' ? me.city : null,
    p_interest_ids: interestFilter.length ? interestFilter : null,
    p_query: q || null,
  }

  const people = useInfiniteQuery({
    queryKey: ['discover', params],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('discover_people', { ...params, p_limit: PAGE, p_offset: pageParam })
      if (error) throw error
      return data as Person[]
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  })
  const list = useMemo(() => people.data?.pages.flat() ?? [], [people.data])

  // Interests of everyone on screen, in one query.
  const ids = list.map((p) => p.id)
  const theirInterests = useQuery({
    queryKey: ['discover-interests', ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_interests').select('user_id, interest_id').in('user_id', ids)
      if (error) throw error
      const map = new Map<string, number[]>()
      for (const r of data) map.set(r.user_id, [...(map.get(r.user_id) ?? []), r.interest_id])
      return map
    },
  })

  async function invite() {
    const url = window.location.origin
    const text = `Estoy en ${brand.name}, una comunidad para gente con diabetes tipo 1. ¡Únete!`
    try {
      if (navigator.share) await navigator.share({ title: brand.name, text, url })
      else {
        await navigator.clipboard.writeText(`${text} ${url}`)
        toast('Enlace copiado')
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  const scopes: Array<{ value: Scope; label: string }> = [
    { value: 'city', label: `En ${me.city}` },
    { value: 'country', label: `En ${countryName(me.country)}` },
    { value: 'all', label: 'Todo el mundo' },
  ]

  return (
    <div>
      <PageHeader title="Descubrir" subtitle="Personas, planes, comunidades y grupos" />

      <Input
        type="search"
        placeholder="Buscar personas por nombre o @usuario"
        leading={<Search size={18} />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar personas"
      />

      {!q && (
        <div className="mt-5 space-y-7">
          <WelcomeCard />
          <WeeklyQuestion onAnswer={(text) => navigate('/home', { state: { prefill: text } })} />
          <PeopleSuggestions />
          <UpcomingNearby />
          <CommunitiesSection />
          <GroupsSection />
        </div>
      )}

      {!q && (
        <h2 id="todas" className="mb-1 mt-8 text-sm font-bold uppercase tracking-wide text-muted">
          Todas las personas
        </h2>
      )}
      {!q && (
        <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Zona">
          {scopes.map((s) => (
            <button
              key={s.value}
              role="radio"
              aria-checked={scope === s.value}
              onClick={() => setScope(s.value)}
              className={cn(
                'h-9 truncate rounded-full px-3.5 text-sm font-semibold transition-colors',
                scope === s.value ? 'bg-primary text-white' : 'bg-surface-muted text-muted hover:text-text',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6" aria-label="Filtrar por interés">
        {interests
          ?.slice()
          .sort((a, b) => Number(myInterestIds.includes(b.id)) - Number(myInterestIds.includes(a.id)))
          .map((i) => {
            const on = interestFilter.includes(i.id)
            return (
              <Chip
                key={i.id}
                emoji={i.emoji}
                selected={on}
                className="h-9 shrink-0"
                onClick={() => setInterestFilter(on ? interestFilter.filter((x) => x !== i.id) : [...interestFilter, i.id])}
              >
                {i.label_es}
              </Chip>
            )
          })}
      </div>

      <div className="mt-5">
        {people.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : people.isError ? (
          <ErrorState message="No hemos podido cargar personas." onRetry={() => people.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title={q ? 'Nadie con ese nombre' : scope === 'city' ? `Aún no hay nadie más en ${me.city}` : 'Nadie por aquí todavía'}
            action={
              <div className="flex flex-col items-center gap-3">
                {!q && scope === 'city' && (
                  <Button variant="soft" onClick={() => setScope('country')}>
                    Ver todo {countryName(me.country)}
                  </Button>
                )}
                <Button variant="secondary" icon={<Share2 size={17} />} onClick={invite}>
                  Invitar a alguien
                </Button>
              </div>
            }
          >
            {q
              ? 'Prueba con otro nombre o usuario.'
              : 'La comunidad está empezando. Invita a alguien que conozcas con T1 — o crea un plan para que te encuentren.'}
          </EmptyState>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {list.map((p) => (
                <li key={p.id}>
                  <PersonCard person={p} interestIds={theirInterests.data?.get(p.id) ?? []} myInterestIds={myInterestIds} />
                </li>
              ))}
            </ul>
            {people.hasNextPage && (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" loading={people.isFetchingNextPage} onClick={() => people.fetchNextPage()}>
                  Ver más
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PersonCard({ person, interestIds, myInterestIds }: { person: Person; interestIds: number[]; myInterestIds: number[] }) {
  const { data: interests } = useInterests()
  // Shared interests first, then the rest; at most 4 tags.
  const tags = (interests ?? [])
    .filter((i) => interestIds.includes(i.id))
    .sort((a, b) => Number(myInterestIds.includes(b.id)) - Number(myInterestIds.includes(a.id)))
    .slice(0, 4)

  return (
    <Link
      to={`/u/${person.username}`}
      className="block h-full rounded-card border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-electric/50 animate-fade-up"
    >
      <div className="flex items-center gap-3">
        <Avatar path={person.avatar_path} name={person.display_name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{person.display_name}</p>
          <p className="flex items-center gap-1 truncate text-sm text-muted">
            <MapPin size={13} className="shrink-0" /> {person.city}
          </p>
        </div>
        {person.shared_interests > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint-soft px-2 py-1 text-xs font-bold text-mint-text">
            <Sparkles size={12} /> {person.shared_interests} en común
          </span>
        )}
      </div>
      {person.bio && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{person.bio}</p>}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((i) => (
            <Tag key={i.id} emoji={i.emoji} highlight={myInterestIds.includes(i.id)}>
              {i.label_es}
            </Tag>
          ))}
        </div>
      )}
    </Link>
  )
}
