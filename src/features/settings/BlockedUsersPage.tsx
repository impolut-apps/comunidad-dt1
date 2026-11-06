import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Avatar, Button, Card, CardSkeleton, EmptyState, ErrorState, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'

interface Blocked {
  id: string
  username: string | null
  display_name: string | null
  avatar_path: string | null
}

export function BlockedUsersPage() {
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: ['blocked'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_blocked_users')
      if (error) throw error
      return data as Blocked[]
    },
  })
  const unblock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('blocked_users').delete().eq('blocker_id', me.id).eq('blocked_id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast('Desbloqueado')
      void qc.invalidateQueries()
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight">Personas bloqueadas</h1>
      </div>
      {list.isPending ? (
        <CardSkeleton />
      ) : list.isError ? (
        <ErrorState message="No hemos podido cargar la lista." onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={28} />} title="No has bloqueado a nadie">
          Si alguien te molesta, puedes bloquearlo desde su perfil. No se le avisará.
        </EmptyState>
      ) : (
        <Card className="divide-y divide-border">
          {list.data.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar path={u.avatar_path} name={u.display_name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{u.display_name}</p>
                <p className="truncate text-sm text-muted">@{u.username}</p>
              </div>
              <Button variant="secondary" size="sm" loading={unblock.isPending && unblock.variables === u.id} onClick={() => unblock.mutate(u.id)}>
                Desbloquear
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
