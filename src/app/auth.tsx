import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

interface AuthState {
  session: Session | null
  /** false until the stored session has been read */
  ready: boolean
  profile: Profile | null
  profileLoading: boolean
  refreshProfile: () => Promise<unknown>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  const profileQuery = useQuery({
    queryKey: ['profile', uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })

  const value: AuthState = {
    session,
    ready,
    profile: profileQuery.data ?? null,
    profileLoading: Boolean(uid) && profileQuery.isPending,
    refreshProfile: () => profileQuery.refetch(),
    signOut: async () => {
      await supabase.auth.signOut()
      qc.clear() // never leave one person's data cached for the next
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

/** For screens inside the member area, where a profile is guaranteed. */
export function useMe() {
  const { profile, session } = useAuth()
  if (!profile || !session) throw new Error('useMe used outside the member area')
  return profile
}
