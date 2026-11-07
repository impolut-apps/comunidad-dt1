import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarX, Clock, Flag, MapPin, MessageCircle, Pencil, Users } from 'lucide-react'
import { Avatar, Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Modal, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { countryName } from '@/lib/geo'
import { ReportDialog } from '@/features/safety/safety'
import { activitySelect, formatWhen, isFull, isPast, participantCount, type Activity } from './api'

interface Participant {
  user_id: string
  joined_at: string
  profile: { username: string; display_name: string; avatar_path: string | null } | null
}

export function PlanDetailPage() {
  const { id } = useParams()
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const [reportOpen, setReportOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const plan = useQuery({
    queryKey: ['activity', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select(activitySelect).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as unknown as Activity | null
    },
  })
  const people = useQuery({
    queryKey: ['activity-participants', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_participants')
        .select('user_id, joined_at, profile:profiles(username, display_name, avatar_path)')
        .eq('activity_id', id!)
        .order('joined_at')
      if (error) throw error
      return data as unknown as Participant[]
    },
  })

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['activity', id] }),
      qc.invalidateQueries({ queryKey: ['activity-participants', id] }),
      qc.invalidateQueries({ queryKey: ['activities'] }),
      qc.invalidateQueries({ queryKey: ['my-activity-ids'] }),
    ])

  const join = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('activity_participants').insert({ activity_id: id, user_id: me.id })
      if (error) throw error
    },
    onSuccess: () => {
      toast('¡Te has apuntado! 🎉')
      void refresh()
    },
    onError: (e) => {
      toast(friendlyError(e), 'error')
      void refresh()
    },
  })
  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('activity_participants').delete().eq('activity_id', id!).eq('user_id', me.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast('Te has desapuntado')
      void refresh()
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('activities').update({ status: 'cancelled' }).eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      setCancelOpen(false)
      toast('Plan cancelado')
      void refresh()
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })
  const message = useMutation({
    mutationFn: async (other: string) => {
      const { data, error } = await supabase.rpc('start_direct_conversation', { other_user: other })
      if (error) throw error
      return data as string
    },
    onSuccess: (conv) => navigate(`/messages/${conv}`),
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  if (plan.isPending) return <CardSkeleton />
  if (plan.isError) return <ErrorState message="No hemos podido cargar el plan." onRetry={() => plan.refetch()} />
  const a = plan.data
  if (!a)
    return (
      <EmptyState icon={<CalendarX size={28} />} title="Plan no disponible" action={<Link to="/plans" className="font-semibold text-primary-text">Ver planes</Link>}>
        Puede que se haya borrado o que no esté disponible para ti.
      </EmptyState>
    )

  const isOrganizer = a.organizer_id === me.id
  const going = people.data?.some((p) => p.user_id === me.id) ?? false
  const cancelled = a.status === 'cancelled'
  const past = isPast(a)
  const full = isFull(a)
  const count = participantCount(a)

  return (
    <div className="space-y-4 animate-fade-up">
      <button onClick={() => navigate(-1)} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
        <ArrowLeft size={22} />
      </button>

      <Card className="overflow-hidden">
        <div className="relative bg-primary px-5 pb-6 pt-5 text-white">
          <div className="absolute -right-10 -top-16 size-48 rounded-full bg-electric/70 blur-2xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              {a.interest && (
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                  {a.interest.emoji} {a.interest.label_es}
                </span>
              )}
              {cancelled && <Badge tone="danger">Cancelado</Badge>}
              {!cancelled && past && <Badge>Ya pasó</Badge>}
              {!cancelled && !past && full && <Badge>Completo</Badge>}
            </div>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight">{a.title}</h1>
          </div>
        </div>
        <div className="space-y-3 p-5">
          <p className="flex items-center gap-2.5 text-[15px] font-semibold">
            <Clock size={18} className="text-primary-text" /> {formatWhen(a.starts_at)}
          </p>
          <p className="flex items-center gap-2.5 text-[15px]">
            <MapPin size={18} className="text-primary-text" />
            {a.area_hint ? `${a.area_hint}, ` : ''}
            {a.city} · {countryName(a.country)}
          </p>
          <p className="flex items-center gap-2.5 text-[15px]">
            <Users size={18} className="text-primary-text" />
            {count} {count === 1 ? 'persona' : 'personas'}
            {a.max_participants ? ` de ${a.max_participants}` : ''}
          </p>
          {a.description && <p className="whitespace-pre-line pt-2 text-[15px] leading-relaxed">{a.description}</p>}

          <div className="flex gap-2 pt-3">
            {isOrganizer ? (
              !cancelled &&
              !past && (
                <>
                  <Button block icon={<Pencil size={17} />} onClick={() => navigate(`/plans/${a.id}/edit`)}>
                    Editar plan
                  </Button>
                  <Button variant="danger" onClick={() => setCancelOpen(true)}>
                    Cancelar
                  </Button>
                </>
              )
            ) : going ? (
              <>
                <Button
                  block
                  icon={<MessageCircle size={18} />}
                  loading={message.isPending}
                  onClick={() => message.mutate(a.organizer_id)}
                >
                  Escribir a {a.organizer?.display_name?.split(' ')[0]}
                </Button>
                {!past && (
                  <Button variant="secondary" loading={leave.isPending} onClick={() => leave.mutate()}>
                    Desapuntarme
                  </Button>
                )}
              </>
            ) : (
              <Button block size="lg" disabled={cancelled || past || full} loading={join.isPending} onClick={() => join.mutate()}>
                {cancelled ? 'Plan cancelado' : past ? 'Este plan ya pasó' : full ? 'Plan completo' : 'Me apunto'}
              </Button>
            )}
            {!isOrganizer && (
              <Button variant="ghost" aria-label="Reportar plan" onClick={() => setReportOpen(true)}>
                <Flag size={18} />
              </Button>
            )}
          </div>
          {!isOrganizer && !going && !cancelled && !past && (
            <p className="text-center text-xs text-muted">Al apuntarte podrás escribir al organizador para concretar el sitio.</p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Quién va</h2>
        <ul className="mt-3 space-y-3">
          {people.data?.map((p) => (
            <li key={p.user_id}>
              <Link to={p.user_id === me.id ? '/profile' : `/u/${p.profile?.username}`} className="flex items-center gap-3 rounded-2xl hover:bg-surface-muted/60">
                <Avatar path={p.profile?.avatar_path} name={p.profile?.display_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {p.profile?.display_name}
                    {p.user_id === me.id && <span className="font-normal text-muted"> (tú)</span>}
                  </span>
                  <span className="block truncate text-sm text-muted">@{p.profile?.username}</span>
                </span>
                {p.user_id === a.organizer_id && <Badge tone="blue">Organiza</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="¿Cancelar este plan?"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setCancelOpen(false)}>
              Volver
            </Button>
            <Button variant="danger" block loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancelar plan
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">Las personas apuntadas verán que se ha cancelado. No se puede deshacer.</p>
      </Modal>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="activity" targetId={a.id} />
    </div>
  )
}
