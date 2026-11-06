import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { Home, Compass, CalendarDays, MessageCircle, User, Settings, Shield } from 'lucide-react'
import { Logo, Avatar, CountDot } from '@/components/ui'
import { useGroups, useInbox, useMessagesRealtime } from '@/features/messages/api'
import { cn } from '@/lib/cn'
import { useMe } from './auth'

const nav = [
  { to: '/home', label: 'Inicio', icon: Home },
  { to: '/discover', label: 'Descubrir', icon: Compass },
  { to: '/plans', label: 'Planes', icon: CalendarDays },
  { to: '/messages', label: 'Mensajes', icon: MessageCircle },
  { to: '/profile', label: 'Perfil', icon: User },
] as const

/**
 * Mobile: content + fixed bottom navigation.
 * Desktop (lg+): left sidebar navigation and a centred content column — not a stretched phone.
 */
export function AppShell() {
  const me = useMe()
  useMessagesRealtime(me.id)
  const { data: inbox } = useInbox()
  const { data: groups } = useGroups()
  const unread =
    (inbox?.reduce((n, c) => n + (c.other ? c.unread_count : 0), 0) ?? 0) +
    (groups?.reduce((n, g) => n + g.unread_count, 0) ?? 0)
  const wide = useLocation().pathname.startsWith('/messages')
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
        <Link to="/home" className="mb-8 px-3">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition-colors',
                  isActive ? 'bg-primary-soft text-primary-soft-text' : 'text-muted hover:bg-surface-muted hover:text-text',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} className={isActive ? 'text-primary-text' : undefined} />
                  <span className="flex-1">{label}</span>
                  {to === '/messages' && <CountDot count={unread} />}
                </>
              )}
            </NavLink>
          ))}
          {me.is_moderator && (
            <NavLink
              to="/moderation"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold',
                  isActive ? 'bg-primary-soft text-primary-soft-text' : 'text-muted hover:bg-surface-muted',
                )
              }
            >
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
          'mx-auto w-full px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 lg:pb-12 lg:pt-10',
          wide ? 'max-w-5xl' : 'max-w-2xl', // messages use a two-pane layout on desktop
        )}
      >
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
