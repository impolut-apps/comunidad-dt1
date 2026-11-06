import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { PageSpinner } from '@/components/ui'
import { useAuth } from './auth'

/** Only for signed-out visitors (login, sign-up…). */
export function PublicOnly() {
  const { session, ready } = useAuth()
  if (!ready) return <PageSpinner />
  if (session) return <Navigate to="/home" replace />
  return <Outlet />
}

/** Signed in, onboarding NOT finished yet. */
export function RequireOnboarding() {
  const { session, ready, profile, profileLoading } = useAuth()
  if (!ready || profileLoading) return <PageSpinner />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.onboarded_at) return <Navigate to="/home" replace />
  return <Outlet />
}

/**
 * Member area: signed in + onboarded + active. This is a UX guard only —
 * the real enforcement is RLS in the database.
 */
export function RequireMember() {
  const { session, ready, profile, profileLoading } = useAuth()
  const location = useLocation()
  if (!ready || profileLoading) return <PageSpinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile?.onboarded_at) return <Navigate to="/onboarding" replace />
  if (profile.status === 'suspended') return <Navigate to="/suspended" replace />
  return <Outlet />
}

export function RequireModerator() {
  const { profile } = useAuth()
  if (!profile?.is_moderator) return <Navigate to="/home" replace />
  return <Outlet />
}
