import type { ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MessageCircle, Users } from 'lucide-react'
import { Avatar, Button, CardSkeleton, CountDot, EmptyState, ErrorState, PageHeader } from '@/components/ui'
import { useMe } from '@/app/auth'
import { cn } from '@/lib/cn'
import { useGroups, useInbox, shortTime, type GroupItem } from './api'
import { Conversation } from './Conversation'
import { GroupIcon, useJoinGroup } from './groups'

type Tab = 'chats' | 'groups'

/** Mobile: list OR conversation. Desktop (lg): list beside the open conversation. */
export function MessagesPage() {
  const { conversationId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'groups' ? 'groups' : 'chats'
  const inbox = useInbox()
  const groups = useGroups()
  const chatsUnread = inbox.data?.reduce((n, c) => n + (c.other ? c.unread_count : 0), 0) ?? 0
  const groupsUnread = groups.data?.reduce((n, g) => n + g.unread_count, 0) ?? 0

  return (
    <div className="lg:-mx-6 lg:grid lg:h-[calc(100dvh-5rem)] lg:grid-cols-[320px_1fr] lg:gap-4">
      <div className={cn(conversationId && 'hidden lg:block', 'lg:overflow-y-auto lg:pr-1')}>
        <PageHeader title="Mensajes" subtitle="Chats privados y grupos de la comunidad" />
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1" role="tablist">
          {(
            [
              ['chats', 'Chats', chatsUnread],
              ['groups', 'Grupos', groupsUnread],
            ] as const
          ).map(([value, label, unread]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setParams(value === 'groups' ? { tab: 'groups' } : {}, { replace: true })}
              className={cn(
                'flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors',
                tab === value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
              )}
            >
              {label}
              <CountDot count={unread} />
            </button>
          ))}
        </div>
        {tab === 'chats' ? <ChatList activeId={conversationId} /> : <GroupList activeId={conversationId} />}
      </div>
      {conversationId ? (
        <Conversation key={conversationId} conversationId={conversationId} />
      ) : (
        <div className="hidden items-center justify-center rounded-card border border-dashed border-border lg:flex">
          <p className="text-muted">Elige una conversación</p>
        </div>
      )}
    </div>
  )
}

function ChatList({ activeId }: { activeId?: string }) {
  const me = useMe()
  const navigate = useNavigate()
  const inbox = useInbox()

  if (inbox.isPending) return <CardSkeleton />
  if (inbox.isError) return <ErrorState message="No hemos podido cargar tus mensajes." onRetry={() => inbox.refetch()} />
  const list = inbox.data.filter((c) => c.other) // blocked/removed people are hidden by RLS
  if (list.length === 0)
    return (
      <EmptyState
        icon={<MessageCircle size={28} />}
        title="Aún no tienes chats privados"
        action={<Button onClick={() => navigate('/discover')}>Descubrir gente</Button>}
      >
        Conecta con alguien o apúntate a un plan para poder escribiros. Mientras tanto, ¡pásate por los grupos!
      </EmptyState>
    )
  return (
    <ul className="space-y-1">
      {list.map((c) => (
        <li key={c.conversation_id}>
          <Row
            to={`/messages/${c.conversation_id}`}
            active={activeId === c.conversation_id}
            avatar={<Avatar path={c.other!.avatar_path} name={c.other!.display_name} />}
            title={c.other!.display_name}
            time={c.last_message_at}
            preview={c.last_message_body ? `${c.last_message_sender === me.id ? 'Tú: ' : ''}${c.last_message_body}` : 'Di hola 👋'}
            unread={c.unread_count}
          />
        </li>
      ))}
    </ul>
  )
}

function GroupList({ activeId }: { activeId?: string }) {
  const me = useMe()
  const groups = useGroups()
  if (groups.isPending) return <CardSkeleton />
  if (groups.isError) return <ErrorState message="No hemos podido cargar los grupos." onRetry={() => groups.refetch()} />

  const mine = groups.data.filter((g) => g.joined)
  const others = groups.data.filter((g) => !g.joined)
  return (
    <div className="space-y-5">
      {mine.length > 0 && (
        <section>
          <h2 className="mb-1 px-3 text-xs font-bold uppercase tracking-wide text-muted">Mis grupos</h2>
          <ul className="space-y-1">
            {mine.map((g) => (
              <li key={g.id}>
                <Row
                  to={`/messages/${g.id}?tab=groups`}
                  active={activeId === g.id}
                  avatar={<GroupIcon emoji={g.emoji} />}
                  title={g.title}
                  time={g.last_message_at}
                  preview={
                    g.last_message_body
                      ? `${g.last_sender_name === me.display_name ? 'Tú' : g.last_sender_name}: ${g.last_message_body}`
                      : `${g.member_count} ${g.member_count === 1 ? 'miembro' : 'miembros'} · Sé el primero en escribir`
                  }
                  unread={g.unread_count}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section>
          <h2 className="mb-2 px-3 text-xs font-bold uppercase tracking-wide text-muted">
            {mine.length ? 'Descubre más grupos' : 'Únete a un grupo'}
          </h2>
          <ul className="space-y-2">
            {others.map((g) => (
              <li key={g.id}>
                <GroupCard group={g} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function GroupCard({ group }: { group: GroupItem }) {
  const navigate = useNavigate()
  const join = useJoinGroup(group.id)
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <GroupIcon emoji={group.emoji} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{group.title}</p>
        {group.description && <p className="line-clamp-2 text-sm text-muted">{group.description}</p>}
        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
          <Users size={12} /> {group.member_count} {group.member_count === 1 ? 'miembro' : 'miembros'}
        </p>
      </div>
      <Button
        size="sm"
        variant="soft"
        loading={join.isPending}
        onClick={() => join.mutate(undefined, { onSuccess: () => navigate(`/messages/${group.id}?tab=groups`) })}
      >
        Unirme
      </Button>
    </div>
  )
}

function Row({
  to,
  active,
  avatar,
  title,
  time,
  preview,
  unread,
}: {
  to: string
  active: boolean
  avatar: ReactNode
  title: string
  time: string | null
  preview: string
  unread: number
}) {
  const bold = unread > 0
  return (
    <Link to={to} className={cn('flex items-center gap-3 rounded-2xl p-3 transition-colors', active ? 'bg-primary-soft' : 'hover:bg-surface-muted')}>
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn('truncate', bold ? 'font-extrabold' : 'font-semibold')}>{title}</p>
          {time && <span className="shrink-0 text-xs text-muted">{shortTime(time)}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={cn('truncate text-sm', bold ? 'font-semibold text-text' : 'text-muted')}>{preview}</p>
          <CountDot count={unread} />
        </div>
      </div>
    </Link>
  )
}
