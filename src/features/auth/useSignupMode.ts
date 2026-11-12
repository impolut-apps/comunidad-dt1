import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** open: anyone · invite: needs a code · closed: nobody (emergency switch, set by moderators). */
export type SignupMode = 'open' | 'invite' | 'closed'

/**
 * Reads the sign-up switch. If the call fails (e.g. the function isn't deployed yet) we fall back to
 * 'open': the database enforces the real rule, this only decides what the screen shows.
 */
export function useSignupMode() {
  const q = useQuery({
    queryKey: ['signup-mode'],
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('signup_mode')
      if (error) throw error
      return data as SignupMode
    },
  })
  return { mode: (q.data ?? 'open') as SignupMode, loading: q.isPending }
}
