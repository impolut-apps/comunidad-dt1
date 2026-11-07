import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CalendarCheck, Check, MessageSquare, UserCheck, UserPlus, X } from 'lucide-react'
import { Avatar, Button, CardSkeleton, EmptyState, ErrorState, PageHeader, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { timeAgo } from '@/features/feed/api'
import type { AppNotification } from './api'

interface Context {
  connections: Map<string, { status: 'pending' | 'accepted'; addressee_id: string }>
  activities: Map<string, string>
  posts: Map<string, string>
}

export function NotificationsPage() {
  const me = useMe()
  const qc = useQueryClient()

  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, entity_id, created_at, read_at, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_path)')
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      const items = data as unknown as AppNotification[]
      const entityIds = (types: AppNotification['type'][]) => [
        ...new Set(items.filter((n) => types.includes(n.type) && n.entity_id).map((n) => n.entity_id!)),
      ]
      const connIds = entityIds(['connection_request', 'connection_accepted'])
      const actIds = entityIds(['activity_joined'])
      const postIds = entityIds(['post_comment'])
      // Fetch what each notification points at, one query per kind (RLS applies).
      const [conns, acts, posts] = await Promise.all([
        connIds.length ? supabase.from('connections').select('id, status, addressee_id').in('id', connIds) : { data: [] },
        actIds.length ? supabase.from('activities').select('id, title').in('id', actIds) : { data: [] },
        postIds.length ? supabase.from('posts').select('id, body').in('id', postIds) : { data: [] },
      ])
      const ctx: Context = {
        connections: new Map((conns.data ?? []).map((c: { id: string; status: 'pending' | 'accepted'; addressee_id: string }) => [c.id, c])),
        activities: new Map((acts.data ?? []).map((a: { id: string; title: string }) => [a.id, a.title])),
        posts: new Map((posts.data ?? []).map((p: { id: string; body: string }) => [p.id, p.body])),
      }
      return { items, ctx }
    },
  })

  // Opening the screen marks everything as read.
  const hasUnread = list.data?.items.some((n) => !n.read_at)
  useEffect(() => {
    if (!hasUnread) return
    void supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .eq('user_id', me.id)
      .then(() => qc.invalidateQueries({ queryKey: ['notifications-unread'] }))
  }, [hasUnread, me.id, qc])

  return (
    <div>
      <PageHeader title="Notificaciones" subtitle="Lo que ha pasado mientras no estabas" />
      {list.isPending ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : list.isError ? (
        <ErrorState message="No hemos podido cargar tus notificaciones." onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} title="Todo tranquilo por aquí">
          Aquí verás cuando alguien quiera conectar contigo, se apunte a tus planes o comente lo que publicas.
        </EmptyState>
      ) : (
        <ul className="space-y-1">
          {list.data.items.map((n) => (
            <li key={n.id}>
              <NotificationRow n={n} ctx={list.data.ctx} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const icons = {
  connection_request: UserPlus,
  connection_accepted: UserCheck,
  activity_joined: CalendarCheck,
  post_comment: MessageSquare,
}

function NotificationRow({ n, ctx }: { n: AppNotification; ctx: Context }) {
  const qc = useQueryClient()
  const toast = useToast()
  const name = n.actor?.display_name ?? 'Alguien'
  const Icon = icons[n.type]
  const conn = n.entity_id ? ctx.connections.get(n.entity_id) : undefined

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const q = accept
        ? supabase.from('connections').update({ status: 'accepted' }).eq('id', n.entity_id!)
        : supabase.from('connections').delete().eq('id', n.entity_id!)
      const { error } = await q
      if (error) throw error
      return accept
    },
    onSuccess: (accepted) => {
      toast(accepted ? `Ahora estás conectado con ${name}` : 'Solicitud rechazada')
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['connection', n.actor?.id] })
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  let text: ReactNode
  let to: string | null = null
  switch (n.type) {
    case 'connection_request':
      text = <><b>{name}</b> quiere conectar contigo</>
      to = n.actor ? `/u/${n.actor.username}` : null
      break
    case 'connection_accepted':
      text = <><b>{name}</b> ha aceptado tu solicitud. ¡Ya podéis escribiros!</>
      to = n.actor ? `/u/${n.actor.username}` : null
      break
    case 'activity_joined': {
      const title = n.entity_id ? ctx.activities.get(n.entity_id) : undefined
      text = <><b>{name}</b> se ha apuntado a {title ? <>«{title}»</> : 'tu plan'}</>
      to = n.entity_id ? `/plans/${n.entity_id}` : null
      break
    }
    case 'post_comment': {
      const body = n.entity_id ? ctx.posts.get(n.entity_id) : undefined
      text = <><b>{name}</b> ha comentado {body?.trim() ? <>«{body.slice(0, 60)}{body.length > 60 ? '…' : ''}»</> : 'tu publicación'}</>
      to = n.entity_id ? `/posts/${n.entity_id}` : null
      break
    }
  }

  const summary = (
    <>
      <span className="relative shrink-0">
        <Avatar path={n.actor?.avatar_path} name={n.actor?.display_name} size="md" />
        <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-bg bg-primary text-white">
          <Icon size={12} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug [&_b]:font-bold">{text}</span>
        <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.created_at)}</span>
      </span>
    </>
  )

  return (
    <div className={cn('rounded-2xl p-3 transition-colors', !n.read_at ? 'bg-primary-soft/50' : 'hover:bg-surface-muted')}>
      {to ? (
        <Link to={to} className="flex items-start gap-3">
          {summary}
        </Link>
      ) : (
        <div className="flex items-start gap-3">{summary}</div>
      )}
      {n.type === 'connection_request' && conn?.status === 'pending' && (
        <div className="mt-2 flex gap-2 pl-[3.75rem]">
          <Button size="sm" icon={<Check size={16} />} loading={respond.isPending && respond.variables} onClick={() => respond.mutate(true)}>
            Aceptar
          </Button>
          <Button size="sm" variant="secondary" icon={<X size={16} />} loading={respond.isPending && !respond.variables} onClick={() => respond.mutate(false)}>
            Rechazar
          </Button>
        </div>
      )}
      {n.type === 'connection_request' && conn?.status === 'accepted' && (
        <p className="mt-1 pl-[3.75rem] text-xs font-semibold text-mint-text">Conectados ✓</p>
      )}
    </div>
  )
}
