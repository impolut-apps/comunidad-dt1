import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronRight, LogOut, Megaphone, MessagesSquare, MoreVertical, Share2, Users } from 'lucide-react'
import { Avatar, Button, Card, CardSkeleton, CountDot, EmptyState, ErrorState, Modal, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { siteUrl } from '@/lib/supabase'
import { shortTime } from '@/features/messages/api'
import { communityCover, useCommunities, useJoinCommunity, useLeaveCommunity, type Community } from './api'
import { CommunityAvatar, EditableCommunityAvatar } from './CommunityAvatar'

export function CommunityPage() {
  const { slug } = useParams()
  const communities = useCommunities()
  const c = communities.data?.find((x) => x.slug === slug)

  if (communities.isPending) return <CardSkeleton />
  if (communities.isError) return <ErrorState message="No hemos podido cargar la comunidad." onRetry={() => communities.refetch()} />
  if (!c)
    return (
      <EmptyState
        icon={<Users size={28} />}
        title="Comunidad no disponible"
        action={
          <Link to="/messages?tab=communities" className="font-semibold text-primary-text">
            Ver comunidades
          </Link>
        }
      >
        Puede que haya cambiado de enlace o que ya no exista.
      </EmptyState>
    )
  return <CommunityView c={c} />
}

function CommunityView({ c }: { c: Community }) {
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const join = useJoinCommunity()
  const leave = useLeaveCommunity()
  const [menu, setMenu] = useState(false)
  const isHost = c.host_id === me.id

  async function share() {
    const url = `${siteUrl}/c/${c.slug}`
    const text = `Únete a ${c.name}`
    try {
      if (navigator.share) await navigator.share({ title: c.name, text, url })
      else {
        await navigator.clipboard.writeText(url)
        toast('Enlace copiado')
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <button onClick={() => navigate('/messages?tab=communities')} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
        <ArrowLeft size={22} />
      </button>

      <Card className="overflow-hidden">
        <div className="relative px-5 pb-6 pt-6 text-white" style={communityCover(c.slug)}>
          <div className="flex items-start gap-4">
            <EditableCommunityAvatar c={c} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-white/80">Comunidad</p>
              <h1 className="mt-0.5 text-2xl font-extrabold leading-tight tracking-tight">{c.name}</h1>
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-white/85">
                <Users size={14} /> {c.member_count} {c.member_count === 1 ? 'miembro' : 'miembros'}
              </p>
            </div>
            {c.joined && !isHost && (
              <button onClick={() => setMenu(true)} className="-mr-2 rounded-full p-2 text-white/90 hover:bg-white/15" aria-label="Opciones de la comunidad">
                <MoreVertical size={20} />
              </button>
            )}
          </div>
          {c.host_username && (
            <Link to={`/u/${c.host_username}`} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 text-sm font-semibold hover:bg-white/25">
              <Avatar path={c.host_avatar} name={c.host_name ?? ''} size="xs" />
              Con {c.host_name} · Administrador
            </Link>
          )}
        </div>
        <div className="space-y-4 p-5">
          {c.description && <p className="text-[15px] leading-relaxed">{c.description}</p>}
          <div className="flex gap-2">
            {c.joined ? (
              <span className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-mint-soft font-bold text-mint-text">
                <Check size={18} /> {isHost ? 'Es tu comunidad' : 'Estás dentro'}
              </span>
            ) : (
              <Button block loading={join.isPending} onClick={() => join.mutate(c)}>
                Unirme a la comunidad
              </Button>
            )}
            <Button variant="secondary" icon={<Share2 size={18} />} onClick={share} aria-label="Compartir comunidad" />
          </div>
        </div>
      </Card>

      {c.joined ? (
        <Card className="divide-y divide-border">
          <ChannelRow
            to={`/messages/${c.announcements_id}?tab=communities`}
            icon={<Megaphone size={20} />}
            title="Avisos"
            subtitle={c.last_announcement_body ?? (isHost ? 'Escribe tu primer aviso a la comunidad' : `Aquí publica ${c.host_name ?? 'el equipo'}`)}
            time={c.last_announcement_at}
            unread={c.unread_announcements}
          />
          <ChannelRow
            to={`/messages/${c.chat_id}?tab=communities`}
            icon={<MessagesSquare size={20} />}
            title="Charla"
            subtitle={c.last_chat_body ? `${c.last_chat_sender}: ${c.last_chat_body}` : 'Habla con el resto de la comunidad'}
            time={c.last_chat_at}
            unread={c.unread_chat}
          />
        </Card>
      ) : (
        c.last_announcement_body && (
          <Card className="p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
              <Megaphone size={14} /> Último aviso
            </p>
            <p className="mt-2 text-[15px]">{c.last_announcement_body}</p>
            <p className="mt-3 text-sm text-muted">Únete para leer todos los avisos y hablar con la comunidad.</p>
          </Card>
        )
      )}

      <p className="px-1 text-center text-xs text-muted">
        Comparte experiencias, no consejos médicos. Sé amable 💙 ·{' '}
        <Link to="/legal/normas" className="font-semibold underline underline-offset-2">
          Normas
        </Link>
      </p>

      <Modal open={menu} onClose={() => setMenu(false)} title={c.name}>
        <Button
          variant="danger"
          block
          className="justify-start"
          icon={<LogOut size={18} />}
          loading={leave.isPending}
          onClick={() => leave.mutate(c, { onSuccess: () => setMenu(false) })}
        >
          Salir de la comunidad
        </Button>
      </Modal>
    </div>
  )
}

function ChannelRow({ to, icon, title, subtitle, time, unread }: { to: string; icon: React.ReactNode; title: string; subtitle: string; time: string | null; unread: number }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-muted">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={unread ? 'font-extrabold' : 'font-bold'}>{title}</span>
          {time && <span className="shrink-0 text-xs text-muted">{shortTime(time)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={unread ? 'truncate text-sm font-semibold' : 'truncate text-sm text-muted'}>{subtitle}</span>
          {unread ? <CountDot count={unread} /> : <ChevronRight size={16} className="shrink-0 text-muted" />}
        </span>
      </span>
    </Link>
  )
}

/** Row used in the Messages › Comunidades list and on Home. */
export function CommunityRow({ c }: { c: Community }) {
  const unread = c.joined ? c.unread_announcements + c.unread_chat : 0
  const preview = c.last_announcement_body
    ? `📣 ${c.last_announcement_body}`
    : c.description ?? (c.host_name ? `Con ${c.host_name}` : `${c.member_count} miembros`)
  return (
    <Link to={`/c/${c.slug}`} className="flex items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-surface-muted">
      <CommunityAvatar c={c} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={unread ? 'truncate font-extrabold' : 'truncate font-semibold'}>{c.name}</span>
          {c.joined && c.last_announcement_at && <span className="shrink-0 text-xs text-muted">{shortTime(c.last_announcement_at)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={unread ? 'truncate text-sm font-semibold' : 'truncate text-sm text-muted'}>{preview}</span>
          {c.joined ? <CountDot count={unread} /> : <span className="shrink-0 text-xs font-semibold text-primary-text">{c.member_count} miembros</span>}
        </span>
      </span>
    </Link>
  )
}
