import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Flag, LogOut, Mic, MoreVertical, Trash2 } from 'lucide-react'
import { Avatar, Button, EmptyState, ErrorState, Modal, Spinner, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { ReportDialog } from '@/features/safety/safety'
import { clock, dayLabel, useConversationInfo, useGroups, useInbox, type Message } from './api'
import { GroupIcon, useJoinGroup } from './groups'
import { ChatComposer, messageSelect } from './ChatComposer'
import { MessageBody, type Receipt } from './MessageBody'

const PAGE = 100

export function Conversation({ conversationId }: { conversationId: string }) {
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const info = useConversationInfo(conversationId)
  const isGroup = info.data?.kind === 'group'
  const inbox = useInbox()
  const groups = useGroups()
  const other = inbox.data?.find((c) => c.conversation_id === conversationId)?.other
  const group = groups.data?.find((g) => g.id === conversationId)
  const joined = !isGroup || Boolean(group?.joined)
  const join = useJoinGroup(conversationId)

  const [reportId, setReportId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const backTo = isGroup ? '/messages?tab=groups' : '/messages'

  const messages = useQuery({
    queryKey: ['messages', conversationId],
    enabled: info.isSuccess && joined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(messageSelect)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (error) throw error
      return (data as unknown as Message[]).reverse()
    },
  })
  const list = messages.data ?? []
  const lastId = list.at(-1)?.id

  // Group messages that arrived via realtime have no embedded sender yet: refetch once to fill names.
  const missingSender = isGroup && list.some((m) => m.sender_id !== me.id && !m.sender)
  useEffect(() => {
    if (missingSender) void messages.refetch()
  }, [missingSender])

  // Mark as read on open and whenever a new message arrives while it's open.
  useEffect(() => {
    if (!joined || !info.isSuccess) return
    void supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', me.id)
      .then(() => qc.invalidateQueries({ queryKey: [isGroup ? 'groups' : 'inbox'] }))
  }, [conversationId, lastId, me.id, qc, joined, isGroup, info.isSuccess])

  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [lastId])

  // Read receipts (1:1 chats): the other person's last_read_at, kept live via realtime.
  const others = useQuery({
    queryKey: ['participants', conversationId],
    enabled: info.isSuccess && !isGroup,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_participants')
        .select('user_id, last_read_at')
        .eq('conversation_id', conversationId)
        .neq('user_id', me.id)
      if (error) throw error
      return data as Array<{ user_id: string; last_read_at: string }>
    },
  })
  useEffect(() => {
    if (!info.isSuccess || isGroup) return
    const channel = supabase
      .channel(`reads-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `conversation_id=eq.${conversationId}` },
        () => void qc.invalidateQueries({ queryKey: ['participants', conversationId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, info.isSuccess, isGroup, qc])
  const otherReadAt = others.data?.[0]?.last_read_at
  const receiptFor = (m: Message): Receipt =>
    m.sender_id !== me.id ? null : !isGroup && otherReadAt && otherReadAt >= m.created_at ? 'read' : 'sent'

  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', me.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setMenu(false)
      qc.removeQueries({ queryKey: ['messages', conversationId] })
      await qc.invalidateQueries({ queryKey: ['groups'] })
      toast('Has salido del grupo')
      navigate('/messages?tab=groups', { replace: true })
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const removeMessage = useMutation({
    mutationFn: async (m: Message) => {
      const { data: mediaPath, error } = await supabase.rpc('delete_my_message', { message_id: m.id })
      if (error) throw error
      // The server returns the file path only when it's safe to delete (i.e. not under review).
      if (mediaPath) await supabase.storage.from('media').remove([mediaPath as string])
      return m.id
    },
    onSuccess: (id) => {
      setConfirmDelete(null)
      qc.setQueryData<Message[]>(['messages', conversationId], (old) =>
        old?.map((x) => (x.id === id ? { ...x, deleted_at: new Date().toISOString(), body: null, media_path: null, media_meta: null } : x)),
      )
      void qc.invalidateQueries({ queryKey: [isGroup ? 'groups' : 'inbox'] })
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  function onSent(m: Message) {
    qc.setQueryData<Message[]>(['messages', conversationId], (old = []) => (old.some((x) => x.id === m.id) ? old : [...old, m]))
    void qc.invalidateQueries({ queryKey: [isGroup ? 'groups' : 'inbox'] })
  }

  const unavailable = info.isSuccess && (!info.data || (!isGroup && inbox.isSuccess && !other))
  if (unavailable)
    return (
      <EmptyState title="Conversación no disponible" action={<Link to="/messages" className="font-semibold text-primary-text">Volver a mensajes</Link>}>
        Puede que ya no esté disponible.
      </EmptyState>
    )

  return (
    <section
      // Mobile: full-screen over the bottom nav, like a native chat. Desktop: right-hand pane.
      className="chat-wallpaper fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)] lg:static lg:z-auto lg:h-full lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:pt-0"
      aria-label="Conversación"
    >
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5">
        <button onClick={() => navigate(backTo)} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted lg:hidden" aria-label="Volver">
          <ArrowLeft size={22} />
        </button>
        {isGroup && info.data ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <GroupIcon emoji={info.data.emoji} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-bold">{info.data.title}</span>
              <span className="block truncate text-xs text-muted">
                {group ? `${group.member_count} ${group.member_count === 1 ? 'miembro' : 'miembros'}` : ''}
              </span>
            </span>
          </div>
        ) : other ? (
          <Link to={`/u/${other.username}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar path={other.avatar_path} name={other.display_name} size="sm" />
            <span className="min-w-0">
              <span className="block truncate font-bold">{other.display_name}</span>
              <span className="block truncate text-xs text-muted">@{other.username}</span>
            </span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
        {isGroup && joined && (
          <button onClick={() => setMenu(true)} className="-mr-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Opciones del grupo">
            <MoreVertical size={20} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-5">
        {isGroup && info.data?.description && (
          <p className="mx-auto mb-4 max-w-md rounded-2xl bg-primary-soft/60 px-4 py-3 text-center text-sm text-primary-soft-text">
            {info.data.description}
            <span className="mt-1 block text-xs opacity-80">
              Comparte experiencias, no consejos médicos. Sé amable 💙 ·{' '}
              <Link to="/legal/normas" className="font-semibold underline underline-offset-2">
                Normas
              </Link>
            </span>
          </p>
        )}
        {!joined ? (
          <div className="py-10 text-center">
            <p className="text-[15px] text-muted">Únete al grupo para leer la conversación y participar.</p>
            <Button className="mt-4" loading={join.isPending} onClick={() => join.mutate()}>
              Unirme al grupo
            </Button>
          </div>
        ) : messages.isPending || info.isPending ? (
          <div className="flex justify-center py-10 text-primary-text">
            <Spinner />
          </div>
        ) : messages.isError ? (
          <ErrorState message="No hemos podido cargar los mensajes." onRetry={() => messages.refetch()} />
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-[15px] text-muted">
            <p className="text-3xl">👋</p>
            <p className="mt-2">{isGroup ? 'Rompe el hielo: preséntate al grupo.' : 'Empieza la conversación. Seguro que tenéis mucho en común.'}</p>
          </div>
        ) : (
          <ol className="space-y-1">
            {list.map((m, i) => {
              const mine = m.sender_id === me.id
              const prev = list[i - 1]
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
              const grouped = Boolean(prev && prev.sender_id === m.sender_id && !newDay)
              const showName = isGroup && !mine && !grouped && m.kind !== 'sticker'
              const voiceAvatar =
                m.kind === 'audio' && !mine ? (
                  <span className="relative shrink-0">
                    <Avatar path={(isGroup ? m.sender : other)?.avatar_path} name={(isGroup ? m.sender : other)?.display_name} size="md" />
                    <Mic size={16} className="absolute -bottom-0.5 -left-1 text-primary-text drop-shadow" aria-hidden />
                  </span>
                ) : undefined
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <li className="flex justify-center py-2" aria-hidden>
                      <span className="rounded-lg bg-surface px-3 py-1 text-xs font-semibold capitalize text-muted shadow-sm">{dayLabel(m.created_at)}</span>
                    </li>
                  )}
                  <li className={cn('flex gap-1.5', mine ? 'justify-end pr-2' : 'justify-start pl-2', !grouped && 'pt-2')}>
                    {isGroup && !mine && (
                      <span className="w-8 shrink-0">
                        {!grouped && m.sender && (
                          <Link to={`/u/${m.sender.username}`}>
                            <Avatar path={m.sender.avatar_path} name={m.sender.display_name} size="xs" />
                          </Link>
                        )}
                      </span>
                    )}
                    <div className={cn('flex max-w-[82%] flex-col', mine ? 'items-end' : 'items-start')}>
                      {showName && <span className="mb-0.5 px-2 text-xs font-bold text-primary-text">{m.sender?.display_name ?? '…'}</span>}
                      <MessageBody
                        message={m}
                        mine={mine}
                        time={clock(m.created_at)}
                        tail={!grouped && m.kind !== 'sticker'}
                        receipt={receiptFor(m)}
                        avatar={voiceAvatar}
                        onToggleMenu={() => !m.deleted_at && setSelected(selected === m.id ? null : m.id)}
                      />
                      {selected === m.id &&
                        (mine ? (
                          <button
                            onClick={() => {
                              setConfirmDelete(m)
                              setSelected(null)
                            }}
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-danger shadow-sm"
                          >
                            <Trash2 size={12} /> Eliminar para todos
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setReportId(m.id)
                              setSelected(null)
                            }}
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-danger shadow-sm"
                          >
                            <Flag size={12} /> Reportar mensaje
                          </button>
                        ))}
                    </div>
                  </li>
                </Fragment>
              )
            })}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      {joined && info.isSuccess && <ChatComposer conversationId={conversationId} isGroup={isGroup} onSent={onSent} />}

      <Modal open={menu} onClose={() => setMenu(false)} title={info.data?.title ?? 'Grupo'}>
        <Button variant="danger" block className="justify-start" icon={<LogOut size={18} />} loading={leave.isPending} onClick={() => leave.mutate()}>
          Salir del grupo
        </Button>
      </Modal>
      {reportId && <ReportDialog open onClose={() => setReportId(null)} targetType="message" targetId={reportId} />}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="¿Eliminar este mensaje?"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" block loading={removeMessage.isPending} onClick={() => confirmDelete && removeMessage.mutate(confirmDelete)}>
              Eliminar para todos
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">Desaparecerá para todas las personas de la conversación. Se verá «Mensaje eliminado».</p>
      </Modal>
    </section>
  )
}
