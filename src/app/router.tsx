import { createBrowserRouter, Navigate } from 'react-router-dom'
import { PublicOnly, RequireMember, RequireModerator, RequireOnboarding } from './guards'
import { ModerationPage } from '@/features/safety/ModerationPage'
import { AppShell } from './AppShell'
import { useAuth } from './auth'
import { PageSpinner } from '@/components/ui'
import { LandingPage } from '@/features/auth/LandingPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { SignupPage } from '@/features/auth/SignupPage'
import { ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage } from '@/features/auth/PasswordPages'
import { OnboardingPage } from '@/features/onboarding/OnboardingPage'
import { ProfilePage } from '@/features/profiles/ProfilePage'
import { EditProfilePage } from '@/features/profiles/EditProfilePage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { DiscoverPage } from '@/features/discover/DiscoverPage'
import { PlansPage } from '@/features/activities/PlansPage'
import { MessagesPage } from '@/features/messages/MessagesPage'
import { HomePage } from '@/features/feed/HomePage'
import { PostDetailPage } from '@/features/feed/PostDetailPage'
import { CreatePlanPage } from '@/features/activities/CreatePlanPage'
import { PlanDetailPage } from '@/features/activities/PlanDetailPage'
import { BlockedUsersPage } from '@/features/settings/BlockedUsersPage'
import {
  LegalPage,
  NotFoundPage,
  SuspendedPage,
} from '@/features/misc/pages'

function Root() {
  const { session, ready } = useAuth()
  if (!ready) return <PageSpinner />
  return session ? <Navigate to="/home" replace /> : <LandingPage />
}

export const router = createBrowserRouter([
  { path: '/', element: <Root /> },
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/legal/terms', element: <LegalPage kind="terms" /> },
  { path: '/legal/privacy', element: <LegalPage kind="privacy" /> },
  { path: '/suspended', element: <SuspendedPage /> },
  {
    element: <RequireOnboarding />,
    children: [{ path: '/onboarding', element: <OnboardingPage /> }],
  },
  {
    element: <RequireMember />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/home', element: <HomePage /> },
          { path: '/posts/:id', element: <PostDetailPage /> },
          { path: '/discover', element: <DiscoverPage /> },
          { path: '/plans', element: <PlansPage /> },
          { path: '/plans/new', element: <CreatePlanPage /> },
          { path: '/plans/:id', element: <PlanDetailPage /> },
          { path: '/messages', element: <MessagesPage /> },
          { path: '/messages/:conversationId', element: <MessagesPage /> },
          { path: '/settings/blocked', element: <BlockedUsersPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/profile/edit', element: <EditProfilePage /> },
          { path: '/u/:username', element: <ProfilePage /> },
          { path: '/settings', element: <SettingsPage /> },
          { element: <RequireModerator />, children: [{ path: '/moderation', element: <ModerationPage /> }] },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
