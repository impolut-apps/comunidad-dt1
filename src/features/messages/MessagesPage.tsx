import { Link, useNavigate, useParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { Avatar, Button, CardSkeleton, CountDot, EmptyState, ErrorState, PageHeader } from '@/components/ui'
import { useMe } from '@/app/auth'
import { cn } from '@/lib/cn'
import { useInbox, shortTime } from './api'
import { Conversation } from './Conversation'

/** Mobile: inbox OR conversation. Desktop (lg): inbox list beside the open conversation. */
export function MessagesPage() {
  const { conversationId } = useParams()
  return (
    <div className="lg:-mx-6 lg:grid lg:h-[calc(100dvh-5rem)] lg:grid-cols-[300px_1fr] lg:gap-4">
      <div className={cn(conversationId && 'hidden lg:block', 'lg:overflow-y-auto lg:pr-1')}>
        <Inbox activeId={conversationId} />
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

function Inbox({ activeId }: { activeId?: string }) {
  const me = useMe()
  const navigate = useNavigate()
  const inbox = useInbox()

  return (
    <div>
      <PageHeader title="Mensajes" subtitle="Tus conversaciones" />
      {inbox.isPending ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : inbox.isError ? (
        <ErrorState message="No hemos podido cargar tus mensajes." onRetry={() => inbox.refetch()} />
      ) : inbox.data.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={28} />}
          title="Aún no tienes conversaciones"
          action={<Button onClick={() => navigate('/discover')}>Descubrir gente</Button>}
        >
          Conecta con alguien o apúntate a un plan para poder escribiros.
        </EmptyState>
      ) : (
        <ul className="space-y-1">
          {inbox.data
            .filter((c) => c.other) // blocked/removed people are hidden by RLS
            .map((c) => {
              const unread = c.unread_count > 0
              return (
                <li key={c.conversation_id}>
                  <Link
                    to={`/messages/${c.conversation_id}`}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl p-3 transition-colors',
                      activeId === c.conversation_id ? 'bg-primary-soft' : 'hover:bg-surface-muted',
                    )}
                  >
                    <Avatar path={c.other!.avatar_path} name={c.other!.display_name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn('truncate', unread ? 'font-extrabold' : 'font-semibold')}>{c.other!.display_name}</p>
                        {c.last_message_at && <span className="shrink-0 text-xs text-muted">{shortTime(c.last_message_at)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('truncate text-sm', unread ? 'font-semibold text-text' : 'text-muted')}>
                          {c.last_message_body
                            ? `${c.last_message_sender === me.id ? 'Tú: ' : ''}${c.last_message_body}`
                            : 'Di hola 👋'}
                        </p>
                        <CountDot count={c.unread_count} />
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}
