import { Link } from 'react-router-dom'
import { Clock, MapPin, Users } from 'lucide-react'
import { Avatar, Badge } from '@/components/ui'
import { cn } from '@/lib/cn'
import { coverFor } from './covers'
import { dateBadge, formatWhen, isFull, isPast, participantCount, type Activity } from './api'

export function ActivityCard({ activity, going }: { activity: Activity; going?: boolean }) {
  const { day, month } = dateBadge(activity.starts_at)
  const count = participantCount(activity)
  const cancelled = activity.status === 'cancelled'
  const past = isPast(activity)

  return (
    <Link
      to={`/plans/${activity.id}`}
      className={cn(
        'flex gap-4 rounded-card border border-border bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:border-electric/50 animate-fade-up',
        (cancelled || past) && 'opacity-70',
      )}
    >
      <div
        className="relative flex w-20 shrink-0 flex-col items-center justify-center overflow-hidden rounded-2xl py-3 text-white shadow-sm"
        style={coverFor(activity.interest?.slug)}
      >
        <span className="text-3xl drop-shadow-sm" aria-hidden>
          {activity.interest?.emoji ?? '📅'}
        </span>
        <span className="mt-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold uppercase text-midnight">
          {day} {month}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {activity.interest && (
            <span className="text-xs font-semibold text-muted">
              {activity.interest.emoji} {activity.interest.label_es}
            </span>
          )}
          {cancelled ? (
            <Badge tone="danger">Cancelado</Badge>
          ) : isFull(activity) ? (
            <Badge>Completo</Badge>
          ) : null}
          {going && !cancelled && <Badge tone="mint">Vas</Badge>}
        </div>
        <h3 className="mt-1 line-clamp-2 font-bold leading-snug">{activity.title}</h3>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={14} /> {formatWhen(activity.starts_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin size={14} /> {activity.area_hint ? `${activity.area_hint}, ` : ''}
            {activity.city}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-2 text-sm">
            <Avatar path={activity.organizer?.avatar_path} name={activity.organizer?.display_name} size="xs" />
            <span className="truncate text-muted">{activity.organizer?.display_name}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-text">
            <Users size={15} /> {count}
            {activity.max_participants ? `/${activity.max_participants}` : ''}
          </span>
        </div>
      </div>
    </Link>
  )
}
