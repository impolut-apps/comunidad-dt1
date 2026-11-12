import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Users } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { activitySelect, formatWhen, type Activity } from '@/features/activities/api'
import { coverFor } from '@/features/activities/covers'
import { communityCover, useCommunities } from '@/features/communities/api'
import { CommunityRow } from '@/features/communities/CommunityPage'
import { useGroups } from '@/features/messages/api'
import { GroupIcon, useJoinGroup } from '@/features/messages/groups'

export function SectionTitle({ title, to, cta = 'Ver todo' }: { title: string; to?: string; cta?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      {to && (
        <Link to={to} className="inline-flex shrink-0 items-center text-sm font-semibold text-primary-text">
          {cta} <ChevronRight size={16} />
        </Link>
      )}
    </div>
  )
}

/** Horizontal strip that bleeds to the screen edge on mobile. */
function Strip({ children }: { children: ReactNode }) {
  return <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6">{children}</ul>
}

/** Creator communities: mine first (with their latest announcement), then ones to join. */
export function CommunitiesSection() {
  const communities = useCommunities()
  const list = communities.data ?? []
  if (!list.length) return null
  const mine = list.filter((c) => c.joined)
  const others = list.filter((c) => !c.joined)
  return (
    <section aria-label="Comunidades">
      <SectionTitle title="Comunidades" to="/messages?tab=communities" />
      {mine.length > 0 && (
        <Card className="mb-3 p-2">
          <ul>
            {mine.slice(0, 3).map((c) => (
              <li key={c.id}>
                <CommunityRow c={c} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {others.length > 0 && (
        <Strip>
          {others.map((c) => (
            <li key={c.id} className="snap-start">
              <Link to={`/c/${c.slug}`} className="flex w-56 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card transition hover:-translate-y-0.5">
                <span className="flex h-20 items-center justify-center text-4xl" style={communityCover(c.slug)} aria-hidden>
                  {c.emoji ?? '💙'}
                </span>
                <span className="p-3">
                  <span className="block truncate font-bold">{c.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.host_name ? `Con ${c.host_name} · ` : ''}
                    {c.member_count} {c.member_count === 1 ? 'miembro' : 'miembros'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </Strip>
      )}
    </section>
  )
}

/** Upcoming plans in my city. */
export function UpcomingNearby() {
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
        .limit(4)
      if (error) throw error
      return data as unknown as Activity[]
    },
  })
  if (plans.isPending) return null
  return (
    <section aria-label="Próximos planes">
      <SectionTitle title={`Próximos planes en ${me.city}`} to="/plans" />
      {plans.data?.length ? (
        <Card className="divide-y divide-border">
          {plans.data.map((a) => (
            <Link key={a.id} to={`/plans/${a.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-surface-muted">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl text-xl" style={coverFor(a.interest?.slug)} aria-hidden>
                {a.interest?.emoji ?? '📅'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{a.title}</span>
                <span className="block text-sm text-muted">{formatWhen(a.starts_at)}</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          ))}
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
          <p className="min-w-[12rem] flex-1 text-sm text-muted">
            Aún no hay planes en {me.city}. Un café, una ruta, un pádel… el primero lo pones tú.
          </p>
          <Link
            to="/plans/new"
            className="inline-flex h-9 w-full items-center justify-center rounded-xl bg-primary-soft px-3.5 text-sm font-semibold text-primary-soft-text hover:brightness-95 sm:w-auto"
          >
            Crear un plan
          </Link>
        </Card>
      )}
    </section>
  )
}

/** Topic groups I haven't joined yet. */
export function GroupsSection() {
  const groups = useGroups()
  const others = groups.data?.filter((g) => !g.joined) ?? []
  if (!others.length) return null
  return (
    <section aria-label="Grupos">
      <SectionTitle title="Grupos para unirte" to="/messages?tab=groups" />
      <Card className="divide-y divide-border">
        {others.slice(0, 4).map((g) => (
          <GroupRow key={g.id} id={g.id} emoji={g.emoji} title={g.title} description={g.description} members={g.member_count} />
        ))}
      </Card>
    </section>
  )
}

function GroupRow({ id, emoji, title, description, members }: { id: string; emoji: string | null; title: string; description: string | null; members: number }) {
  const navigate = useNavigate()
  const join = useJoinGroup(id)
  return (
    <div className="flex items-center gap-3 p-3">
      <GroupIcon emoji={emoji} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        <p className="truncate text-sm text-muted">
          {description ?? (
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {members}
            </span>
          )}
        </p>
      </div>
      <Button size="sm" variant="soft" loading={join.isPending} onClick={() => join.mutate(undefined, { onSuccess: () => navigate(`/messages/${id}?tab=groups`) })}>
        Unirme
      </Button>
    </div>
  )
}
