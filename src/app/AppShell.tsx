import { useEffect } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { Bell, Home, Compass, CalendarDays, MessageCircle, User, Settings, Shield } from 'lucide-react'
import { Logo, Avatar, CountDot } from '@/components/ui'
import { useGroups, useInbox, useMessagesRealtime } from '@/features/messages/api'
import { useNotificationsRealtime, useUnreadNotifications } from '@/features/notifications/api'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useMe } from './auth'

const nav = [
  { to: '/home', label: 'Inicio', icon: Home },
  { to: '/discover', label: 'Descubrir', icon: Compass },
  { to: '/plans', label: 'Planes', icon: CalendarDays },
  { to: '/messages', label: 'Mensajes', icon: MessageCircle },
  { to: '/profile', label: 'Perfil', icon: User },
] as const

const sideLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition-colors',
    isActive ? 'bg-primary-soft text-primary-soft-text' : 'text-muted hover:bg-surface-muted hover:text-text',
  )

/**
 * Mobile: content + fixed bottom navigation (+ a notifications bell top-right).
 * Desktop (lg+): left sidebar navigation and a centred content column — not a stretched phone.
 */
export function AppShell() {
  const me = useMe()
  const { pathname } = useLocation()
  useMessagesRealtime(me.id)
  useNotificationsRealtime(me.id)
  // Aggregate "active members" metric; the server stores at most one timestamp per hour.
  useEffect(() => {
    // Postgrest builders are lazy: the request is only sent once .then() is called.
    supabase.rpc('touch_activity').then(() => undefined)
  }, [me.id])
  const { data: inbox } = useInbox()
  const { data: groups } = useGroups()
  const { data: notifications = 0 } = useUnreadNotifications(me.id)
  const unread =
    (inbox?.reduce((n, c) => n + (c.other ? c.unread_count : 0), 0) ?? 0) +
    (groups?.reduce((n, g) => n + g.unread_count, 0) ?? 0)
  const wide = pathname.startsWith('/messages')
  // The mobile bell floats top-right on top-level screens (not inside chats, forms or the profile, which has its own icons).
  const showBell = ['/home', '/discover', '/plans', '/messages'].includes(pathname)

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
        <Link to="/home" className="mb-8 px-3">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={sideLink}>
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} className={isActive ? 'text-primary-text' : undefined} />
                  <span className="flex-1">{label}</span>
                  {to === '/messages' && <CountDot count={unread} />}
                </>
              )}
            </NavLink>
          ))}
          <NavLink to="/notifications" className={sideLink}>
            {({ isActive }) => (
              <>
                <Bell size={22} strokeWidth={isActive ? 2.4 : 2} className={isActive ? 'text-primary-text' : undefined} />
                <span className="flex-1">Notificaciones</span>
                <CountDot count={notifications} />
              </>
            )}
          </NavLink>
          {me.is_moderator && (
            <NavLink to="/moderation" className={sideLink}>
              <Shield size={22} /> Moderación
            </NavLink>
          )}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-2xl p-3">
          <Avatar path={me.avatar_path} name={me.display_name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{me.display_name}</p>
            <p className="truncate text-xs text-muted">@{me.username}</p>
          </div>
          <Link to="/settings" className="rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Ajustes">
            <Settings size={20} />
          </Link>
        </div>
      </aside>

      <main
        className={cn(
          'relative mx-auto w-full px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 lg:pb-12 lg:pt-10',
          wide ? 'max-w-5xl' : 'max-w-2xl', // messages use a two-pane layout on desktop
        )}
      >
        {showBell && (
          <Link
            to="/notifications"
            className="absolute right-4 top-[max(1.25rem,env(safe-area-inset-top))] z-10 flex size-11 items-center justify-center rounded-full bg-surface text-text shadow-card sm:right-6 lg:hidden"
            aria-label={notifications ? `Notificaciones (${notifications} sin leer)` : 'Notificaciones'}
          >
            <Bell size={21} />
            {notifications > 0 && <CountDot count={notifications} className="absolute -right-1 -top-1 border-2 border-bg" />}
          </Link>
        )}
        <Outlet />
      </main>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {nav.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-semibold transition-colors',
                    isActive ? 'text-primary-text' : 'text-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'relative flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                        isActive && 'bg-primary-soft',
                      )}
                    >
                      <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                      {to === '/messages' && unread > 0 && (
                        <CountDot count={unread} className="absolute -top-1 right-1.5 border-2 border-surface" />
                      )}
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
