import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, MapPin, Share2, Sparkles, UsersRound } from 'lucide-react'
import { Avatar, Button, Card, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { shareInvite } from '@/lib/share'

interface Suggestion {
  id: string
  username: string
  display_name: string
  avatar_path: string | null
  city: string
  created_at: string
  shared_interests: number
  same_city: boolean
}

const NEW_DAYS = 7

/**
 * "People you could meet": same city first, then shared interests (the discover_people ranking),
 * skipping anyone I'm already connected to or have a pending request with. Real people only —
 * when there's nobody yet, it invites the member to bring someone instead of showing filler.
 */
export function PeopleSuggestions() {
  const me = useMe()
  const toast = useToast()
  const people = useQuery({
    queryKey: ['people-suggestions', me.id],
    queryFn: async () => {
      const [found, conns] = await Promise.all([
        supabase.rpc('discover_people', { p_country: me.country, p_limit: 12 }),
        supabase.from('connections').select('requester_id, addressee_id'),
      ])
      if (found.error) throw found.error
      const known = new Set((conns.data ?? []).flatMap((c) => [c.requester_id, c.addressee_id]))
      return (found.data as Suggestion[]).filter((p) => !known.has(p.id)).slice(0, 8)
    },
  })

  if (people.isPending) return null
  if (!people.data?.length)
    return (
      <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-mint-soft text-mint-text">
          <UsersRound size={24} />
        </span>
        <div className="min-w-[12rem] flex-1">
          <p className="font-bold">La Tribu está empezando cerca de ti</p>
          <p className="text-sm text-muted">¿Conoces a alguien con T1 que se apuntaría? Cuantos más, más planes.</p>
        </div>
        <span className="w-full sm:w-auto">
          <Button size="sm" variant="soft" block icon={<Share2 size={16} />} onClick={() => shareInvite(toast)}>
            Invitar
          </Button>
        </span>
      </Card>
    )

  return (
    <section aria-label="Personas que podrías conocer">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Personas que podrías conocer</h2>
        {/* Lives in Descubrir: jump to the full directory further down. */}
        <a
          href="#todas"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('todas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
          className="inline-flex items-center text-sm font-semibold text-primary-text"
        >
          Ver todas <ChevronRight size={16} />
        </a>
      </div>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6">
        {people.data.map((p) => {
          const isNew = Date.now() - new Date(p.created_at).getTime() < NEW_DAYS * 86400_000
          return (
            <li key={p.id} className="snap-start">
              <Link
                to={`/u/${p.username}`}
                className="flex w-40 flex-col items-center rounded-card border border-border bg-surface p-4 text-center shadow-card transition hover:-translate-y-0.5 hover:border-electric/50"
              >
                <span className="relative">
                  <Avatar path={p.avatar_path} name={p.display_name} size="lg" className="ring-4 ring-primary-soft" />
                  {isNew && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-mint px-2 py-0.5 text-[10px] font-extrabold text-midnight">
                      NUEVO
                    </span>
                  )}
                </span>
                <span className="mt-3 w-full truncate font-bold">{p.display_name}</span>
                <span className="flex w-full items-center justify-center gap-1 truncate text-xs text-muted">
                  <MapPin size={12} className="shrink-0" /> {p.city}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-soft-text">
                  {p.shared_interests > 0 ? (
                    <>
                      <Sparkles size={12} /> {p.shared_interests} en común
                    </>
                  ) : p.same_city ? (
                    'De tu ciudad'
                  ) : (
                    'Saluda 👋'
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
