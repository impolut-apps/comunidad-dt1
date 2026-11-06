import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Flag, SendHorizontal } from 'lucide-react'
import { Avatar, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { ReportDialog } from '@/features/safety/safety'
import { clock, dayLabel, useInbox, type Message } from './api'

const PAGE = 100

export function Conversation({ conversationId }: { conversationId: string }) {
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const inbox = useInbox()
  const other = inbox.data?.find((c) => c.conversation_id === conversationId)?.other
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const messages = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, body, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (error) throw error
      return (data as Message[]).reverse()
    },
  })
  const list = messages.data ?? []
  const lastId = list.at(-1)?.id

  // Mark as read on open and whenever a new message arrives while it's open.
  useEffect(() => {
    void supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', me.id)
      .then(() => qc.invalidateQueries({ queryKey: ['inbox'] }))
  }, [conversationId, lastId, me.id, qc])

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lastId])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: me.id, body })
      .select('id, conversation_id, sender_id, body, created_at')
      .single()
    setSending(false)
    if (error) return toast(friendlyError(error), 'error')
    setDraft('')
    qc.setQueryData<Message[]>(['messages', conversationId], (old = []) =>
      old.some((m) => m.id === data.id) ? old : [...old, data as Message],
    )
    void qc.invalidateQueries({ queryKey: ['inbox'] })
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  if (inbox.isSuccess && !other)
    return (
      <EmptyState title="Conversación no disponible" action={<Link to="/messages" className="font-semibold text-primary-text">Volver a mensajes</Link>}>
        Puede que esta persona ya no esté disponible.
      </EmptyState>
    )

  return (
    <section
      // Mobile: full-screen over the bottom nav, like a native chat. Desktop: right-hand pane.
      className="fixed inset-0 z-50 flex flex-col bg-bg pt-[env(safe-area-inset-top)] lg:static lg:z-auto lg:h-full lg:rounded-card lg:border lg:border-border lg:bg-surface lg:pt-0"
      aria-label="Conversación"
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={() => navigate('/messages')} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted lg:hidden" aria-label="Volver">
          <ArrowLeft size={22} />
        </button>
        {other && (
          <Link to={`/u/${other.username}`} className="flex min-w-0 items-center gap-3">
            <Avatar path={other.avatar_path} name={other.display_name} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-bold">{other.display_name}</span>
              <span className="block truncate text-xs text-muted">@{other.username}</span>
            </span>
          </Link>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.isPending ? (
          <div className="flex justify-center py-10 text-primary-text">
            <Spinner />
          </div>
        ) : messages.isError ? (
          <ErrorState message="No hemos podido cargar los mensajes." onRetry={() => messages.refetch()} />
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-[15px] text-muted">
            <p className="text-3xl">👋</p>
            <p className="mt-2">Empieza la conversación. Seguro que tenéis mucho en común.</p>
          </div>
        ) : (
          <ol className="space-y-1.5">
            {list.map((m, i) => {
              const mine = m.sender_id === me.id
              const prev = list[i - 1]
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
              const grouped = prev && prev.sender_id === m.sender_id && !newDay
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <li className="py-3 text-center text-xs font-semibold capitalize text-muted" aria-hidden>
                      {dayLabel(m.created_at)}
                    </li>
                  )}
                  <li className={cn('flex flex-col', mine ? 'items-end' : 'items-start', !grouped && 'pt-1.5')}>
                    <button
                      type="button"
                      onClick={() => !mine && setSelected(selected === m.id ? null : m.id)}
                      className={cn(
                        'max-w-[80%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-left text-[15px] leading-relaxed',
                        mine ? 'rounded-br-lg bg-primary text-white' : 'cursor-default rounded-bl-lg border border-border bg-surface text-text',
                      )}
                    >
                      {m.body}
                      <span className={cn('ml-2 inline-block translate-y-0.5 text-[11px]', mine ? 'text-white/70' : 'text-muted')}>
                        {clock(m.created_at)}
                      </span>
                    </button>
                    {selected === m.id && (
                      <button
                        onClick={() => {
                          setReportId(m.id)
                          setSelected(null)
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-danger"
                      >
                        <Flag size={12} /> Reportar mensaje
                      </button>
                    )}
                  </li>
                </Fragment>
              )
            })}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-border bg-surface px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:rounded-b-card">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={2000}
          placeholder="Escribe un mensaje…"
          aria-label="Mensaje"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-border bg-bg px-4 py-2.5 text-[15px] focus:border-electric focus:outline-none focus:ring-4 focus:ring-electric/15"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition active:scale-95 disabled:opacity-40"
          aria-label="Enviar"
        >
          {sending ? <Spinner size={18} /> : <SendHorizontal size={20} />}
        </button>
      </form>

      {reportId && <ReportDialog open onClose={() => setReportId(null)} targetType="message" targetId={reportId} />}
    </section>
  )
}
