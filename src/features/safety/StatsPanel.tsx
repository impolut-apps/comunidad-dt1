import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Button, Card, CardSkeleton, ErrorState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { countryName } from '@/lib/geo'
import { cn } from '@/lib/cn'

type N = number | string | null
interface Stats {
  generated_at: string
  funnel: { registered: N; verified: N; onboarded: N; suspended: N }
  active: { d1: N; d7: N; d30: N }
  contributors_30d: N
  retention_7d: { eligible: N; retained: N }
  new_members_daily: Array<{ day: string; count: N }>
  top_cities: Array<{ city: string; country: string; count: N }>
  countries: Array<{ country: string; count: N }>
  top_interests: Array<{ emoji: string; label: string; count: N }>
  age_ranges: Array<{ range: string; count: N }>
  content: Record<'posts_7d' | 'posts_30d' | 'comments_30d' | 'reactions_30d' | 'messages_7d' | 'messages_30d' | 'connections' | 'connections_30d', N>
  plans: { upcoming: N; created_30d: N; joins_30d: N; avg_attendees: N }
  groups: Array<{ emoji: string | null; title: string; members: N; messages_7d: N }>
  moderation: { open: N; resolved_30d: N; avg_hours_to_resolve: N; hidden_posts: N }
}

const num = (v: N) => Number(v ?? 0)
const fmt = new Intl.NumberFormat('es')
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : '—')
const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

export function StatsPanel() {
  const stats = useQuery({
    queryKey: ['admin-stats'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_stats')
      if (error) throw error
      return data as Stats
    },
  })

  if (stats.isPending)
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  if (stats.isError) return <ErrorState message="No hemos podido cargar las estadísticas." onRetry={() => stats.refetch()} />
  const s = stats.data
  const members = num(s.funnel.onboarded) - num(s.funnel.suspended)
  const newLast30 = s.new_members_daily.reduce((n, d) => n + num(d.count), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Actualizado a las {timeFmt.format(new Date(s.generated_at))}</span>
        <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} loading={stats.isFetching} onClick={() => stats.refetch()}>
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Miembros" value={members} hint={`${fmt.format(num(s.funnel.registered))} registros en total`} />
        <Tile label="Activos hoy" value={num(s.active.d1)} hint={`${pct(num(s.active.d1), members)} de los miembros`} />
        <Tile label="Activos 7 días" value={num(s.active.d7)} hint={`${pct(num(s.active.d7), members)} de los miembros`} />
        <Tile label="Activos 30 días" value={num(s.active.d30)} hint={`${pct(num(s.active.d30), members)} de los miembros`} />
        <Tile
          label="Retención 7 días"
          value={num(s.retention_7d.eligible) ? pct(num(s.retention_7d.retained), num(s.retention_7d.eligible)) : '—'}
          hint={
            num(s.retention_7d.eligible)
              ? `${num(s.retention_7d.retained)} de ${num(s.retention_7d.eligible)} siguen viniendo`
              : 'Aún no hay miembros con más de 7 días'
          }
        />
        <Tile label="Participan" value={num(s.contributors_30d)} hint="Publicaron, escribieron o se apuntaron (30 días)" />
      </div>
      <p className="text-xs text-muted">
        "Activo" = abrió la app. La medición de actividad empezó con esta versión, así que los primeros días los números
        serán bajos.
      </p>

      <Section title="Embudo de registro">
        <Bars
          max={num(s.funnel.registered)}
          rows={[
            { label: 'Se registraron', value: num(s.funnel.registered) },
            { label: 'Confirmaron el email', value: num(s.funnel.verified), note: pct(num(s.funnel.verified), num(s.funnel.registered)) },
            { label: 'Completaron el perfil', value: num(s.funnel.onboarded), note: pct(num(s.funnel.onboarded), num(s.funnel.registered)) },
          ]}
        />
        {num(s.funnel.suspended) > 0 && <p className="mt-3 text-sm text-muted">{num(s.funnel.suspended)} cuentas suspendidas.</p>}
      </Section>

      <Section title={`Nuevos miembros · últimos 30 días (${fmt.format(newLast30)})`}>
        <DailyChart data={s.new_members_daily.map((d) => ({ day: d.day, count: num(d.count) }))} />
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Ciudades">
          <Ranking rows={s.top_cities.map((c) => ({ label: `${c.city}${c.country !== 'ES' ? ` (${c.country})` : ''}`, value: num(c.count) }))} />
        </Section>
        <Section title="Países">
          <Ranking rows={s.countries.map((c) => ({ label: countryName(c.country), value: num(c.count) }))} />
        </Section>
        <Section title="Intereses más populares">
          <Ranking rows={s.top_interests.map((i) => ({ label: `${i.emoji} ${i.label}`, value: num(i.count) }))} />
        </Section>
        <Section title="Edades">
          <Ranking rows={s.age_ranges.map((a) => ({ label: a.range === 'Sin indicar' ? a.range : `${a.range} años`, value: num(a.count) }))} />
        </Section>
      </div>

      <Section title="Actividad de la comunidad">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Mini label="Publicaciones (7 d)" value={s.content.posts_7d} />
          <Mini label="Publicaciones (30 d)" value={s.content.posts_30d} />
          <Mini label="Comentarios (30 d)" value={s.content.comments_30d} />
          <Mini label="Reacciones (30 d)" value={s.content.reactions_30d} />
          <Mini label="Mensajes (7 d)" value={s.content.messages_7d} />
          <Mini label="Mensajes (30 d)" value={s.content.messages_30d} />
          <Mini label="Conexiones" value={s.content.connections} />
          <Mini label="Conexiones nuevas (30 d)" value={s.content.connections_30d} />
        </div>
      </Section>

      <Section title="Planes">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Mini label="Próximos" value={s.plans.upcoming} />
          <Mini label="Creados (30 d)" value={s.plans.created_30d} />
          <Mini label="Inscripciones (30 d)" value={s.plans.joins_30d} />
          <Mini label="Media de asistentes" value={s.plans.avg_attendees ?? '—'} />
        </div>
      </Section>

      <Section title="Grupos">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-semibold">Grupo</th>
              <th className="pb-2 text-right font-semibold">Miembros</th>
              <th className="pb-2 text-right font-semibold">Mensajes 7 d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {s.groups.map((g) => (
              <tr key={g.title}>
                <td className="py-2">
                  <span aria-hidden>{g.emoji}</span> {g.title}
                </td>
                <td className="py-2 text-right tabular-nums">{fmt.format(num(g.members))}</td>
                <td className="py-2 text-right tabular-nums">{fmt.format(num(g.messages_7d))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Moderación">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Mini label="Reportes abiertos" value={s.moderation.open} />
          <Mini label="Resueltos (30 d)" value={s.moderation.resolved_30d} />
          <Mini label="Horas medias en resolver" value={s.moderation.avg_hours_to_resolve ?? '—'} />
          <Mini label="Publicaciones ocultas" value={s.moderation.hidden_posts} />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </Card>
  )
}

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">{typeof value === 'number' ? fmt.format(value) : value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-muted">{hint}</p>}
    </Card>
  )
}

function Mini({ label, value }: { label: string; value: N }) {
  const shown = typeof value === 'string' && Number.isNaN(Number(value)) ? value : fmt.format(num(value))
  return (
    <div>
      <p className="text-xl font-extrabold tabular-nums">{shown}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

/** Horizontal magnitude bars, single hue; values in text ink beside the bar. */
function Bars({ rows, max }: { rows: Array<{ label: string; value: number; note?: string }>; max: number }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span>{r.label}</span>
            <span className="tabular-nums font-semibold">
              {fmt.format(r.value)}
              {r.note && <span className="ml-1.5 font-normal text-muted">{r.note}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted">
            <div
              className="h-2 rounded-full bg-primary dark:bg-electric"
              style={{ width: `${max > 0 ? Math.max((r.value / max) * 100, r.value ? 2 : 0) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Ranking({ rows }: { rows: Array<{ label: string; value: number }> }) {
  if (!rows.length) return <p className="text-sm text-muted">Sin datos todavía.</p>
  return <Bars rows={rows} max={Math.max(...rows.map((r) => r.value))} />
}

/** 30 daily bars with a hover tooltip, plus a screen-reader table. */
function DailyChart({ data }: { data: Array<{ day: string; count: number }> }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.count))
  const h = hover !== null ? data[hover] : null
  return (
    <div>
      <div className="mb-2 h-5 text-sm" aria-hidden>
        {h ? (
          <span>
            <span className="font-semibold">{dayFmt.format(new Date(h.day))}</span>: {h.count} {h.count === 1 ? 'nuevo miembro' : 'nuevos miembros'}
          </span>
        ) : (
          <span className="text-muted">Pasa el dedo o el ratón por las barras</span>
        )}
      </div>
      <div className="flex h-32 items-end gap-[2px] border-b border-border" onMouseLeave={() => setHover(null)} aria-hidden>
        {data.map((d, i) => (
          <div
            key={d.day}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
          >
            <div
              className={cn('w-full rounded-t-[4px] transition-opacity', d.count ? 'bg-primary dark:bg-electric' : 'bg-transparent', hover !== null && hover !== i && 'opacity-50')}
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted" aria-hidden>
        <span>{dayFmt.format(new Date(data[0].day))}</span>
        <span>Hoy</span>
      </div>
      <table className="sr-only">
        <caption>Nuevos miembros por día</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th>{dayFmt.format(new Date(d.day))}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
