import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PublicOnly, RequireMember, RequireModerator, RequireOnboarding } from './guards'
import { AppShell } from './AppShell'
import { useAuth } from './auth'
import { PageSpinner } from '@/components/ui'
import { LandingPage } from '@/features/auth/LandingPage'
import { NotFoundPage, SuspendedPage } from '@/features/misc/pages'

/**
 * Code-splitting: each screen is its own chunk, downloaded the first time it's opened.
 * The landing page and the app shell stay in the main bundle for a fast first paint.
 */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M) {
  const Component = lazy(async () => ({ default: (await load())[name] as ComponentType }))
  return (
    <Suspense fallback={<PageSpinner />}>
      <Component />
    </Suspense>
  )
}

const auth = () => import('@/features/auth/LoginPage')
const signup = () => import('@/features/auth/SignupPage')
const passwords = () => import('@/features/auth/PasswordPages')
const legal = () => import('@/features/legal/LegalPages')
const onboarding = () => import('@/features/onboarding/OnboardingPage')
const feed = () => import('@/features/feed/HomePage')
const post = () => import('@/features/feed/PostDetailPage')
const discover = () => import('@/features/discover/DiscoverPage')
const plans = () => import('@/features/activities/PlansPage')
const planForm = () => import('@/features/activities/CreatePlanPage')
const planDetail = () => import('@/features/activities/PlanDetailPage')
const messages = () => import('@/features/messages/MessagesPage')
const notifications = () => import('@/features/notifications/NotificationsPage')
const profile = () => import('@/features/profiles/ProfilePage')
const editProfile = () => import('@/features/profiles/EditProfilePage')
const settings = () => import('@/features/settings/SettingsPage')
const blocked = () => import('@/features/settings/BlockedUsersPage')
const moderation = () => import('@/features/safety/ModerationPage')
const community = () => import('@/features/communities/CommunityPage')

function Root(): ReactNode {
  const { session, ready } = useAuth()
  if (!ready) return <PageSpinner />
  return session ? <Navigate to="/home" replace /> : <LandingPage />
}

export const router = createBrowserRouter([
  { path: '/', element: <Root /> },
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: page(auth, 'LoginPage') },
      { path: '/signup', element: page(signup, 'SignupPage') },
      { path: '/forgot-password', element: page(passwords, 'ForgotPasswordPage') },
    ],
  },
  { path: '/verify-email', element: page(passwords, 'VerifyEmailPage') },
  { path: '/reset-password', element: page(passwords, 'ResetPasswordPage') },
  { path: '/legal/terms', element: page(legal, 'TermsPage') },
  { path: '/legal/privacy', element: page(legal, 'PrivacyPage') },
  { path: '/legal/normas', element: page(legal, 'GuidelinesPage') },
  { path: '/ayuda', element: page(legal, 'HelpPage') },
  { path: '/suspended', element: <SuspendedPage /> },
  {
    element: <RequireOnboarding />,
    children: [{ path: '/onboarding', element: page(onboarding, 'OnboardingPage') }],
  },
  {
    element: <RequireMember />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/home', element: page(feed, 'HomePage') },
          { path: '/posts/:id', element: page(post, 'PostDetailPage') },
          { path: '/discover', element: page(discover, 'DiscoverPage') },
          { path: '/plans', element: page(plans, 'PlansPage') },
          { path: '/plans/new', element: page(planForm, 'CreatePlanPage') },
          { path: '/plans/:id', element: page(planDetail, 'PlanDetailPage') },
          { path: '/plans/:id/edit', element: page(planForm, 'EditPlanPage') },
          { path: '/messages', element: page(messages, 'MessagesPage') },
          { path: '/messages/:conversationId', element: page(messages, 'MessagesPage') },
          { path: '/notifications', element: page(notifications, 'NotificationsPage') },
          { path: '/c/:slug', element: page(community, 'CommunityPage') },
          { path: '/settings/blocked', element: page(blocked, 'BlockedUsersPage') },
          { path: '/profile', element: page(profile, 'ProfilePage') },
          { path: '/profile/edit', element: page(editProfile, 'EditProfilePage') },
          { path: '/u/:username', element: page(profile, 'ProfilePage') },
          { path: '/settings', element: page(settings, 'SettingsPage') },
          { element: <RequireModerator />, children: [{ path: '/moderation', element: page(moderation, 'ModerationPage') }] },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
