import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Clock, Flag, MessageCircle, MoreHorizontal, ShieldBan, UserPlus, X } from 'lucide-react'
import { Button, Modal, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import type { Profile } from '@/lib/types'
import { BlockDialog, ReportDialog } from '@/features/safety/safety'

interface Connection {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted'
}

export function useConnection(otherId: string) {
  const me = useMe()
  return useQuery({
    queryKey: ['connection', otherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('connections')
        .select('id, requester_id, addressee_id, status')
        .or(`and(requester_id.eq.${me.id},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${me.id})`)
        .maybeSingle()
      if (error) throw error
      return data as Connection | null
    },
  })
}

/** Connect / accept / message + overflow menu (report, block) for someone else's profile. */
export function ProfileActions({ profile }: { profile: Profile }) {
  const me = useMe()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: conn, isPending } = useConnection(profile.id)
  const [menu, setMenu] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const name = profile.display_name ?? 'esta persona'
  const refresh = () => qc.invalidateQueries({ queryKey: ['connection', profile.id] })

  const request = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('connections').insert({ requester_id: me.id, addressee_id: profile.id })
      if (error) throw error
    },
    onSuccess: () => {
      toast('Solicitud enviada')
      void refresh()
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', conn!.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast(`Ahora estás conectado con ${name}`)
      void refresh()
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('connections').delete().eq('id', conn!.id)
      if (error) throw error
    },
    onSuccess: () => void refresh(),
    onError: (e) => toast(friendlyError(e), 'error'),
  })
  const message = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('start_direct_conversation', { other_user: profile.id })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => navigate(`/messages/${id}`),
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  const incoming = conn?.status === 'pending' && conn.addressee_id === me.id
  const outgoing = conn?.status === 'pending' && conn.requester_id === me.id
  const connected = conn?.status === 'accepted'

  return (
    <>
      <div className="mt-5 flex gap-2">
        {isPending ? (
          <div className="h-11 flex-1 animate-pulse rounded-2xl bg-surface-muted" aria-hidden />
        ) : connected ? (
          <Button block icon={<MessageCircle size={18} />} loading={message.isPending} onClick={() => message.mutate()}>
            Enviar mensaje
          </Button>
        ) : incoming ? (
          <>
            <Button block icon={<Check size={18} />} loading={accept.isPending} onClick={() => accept.mutate()}>
              Aceptar solicitud
            </Button>
            <Button variant="secondary" aria-label="Rechazar" onClick={() => remove.mutate()} loading={remove.isPending}>
              <X size={18} />
            </Button>
          </>
        ) : outgoing ? (
          <Button block variant="soft" icon={<Clock size={18} />} loading={remove.isPending} onClick={() => remove.mutate()}>
            Solicitud enviada · Cancelar
          </Button>
        ) : (
          <Button block icon={<UserPlus size={18} />} loading={request.isPending} onClick={() => request.mutate()}>
            Conectar
          </Button>
        )}
        <Button variant="secondary" aria-label="Más opciones" onClick={() => setMenu(true)}>
          <MoreHorizontal size={18} />
        </Button>
      </div>

      <Modal open={menu} onClose={() => setMenu(false)} title={name}>
        <div className="space-y-2">
          {connected && (
            <Button
              variant="secondary"
              block
              className="justify-start"
              icon={<X size={18} />}
              onClick={() => {
                remove.mutate()
                setMenu(false)
              }}
            >
              Eliminar conexión
            </Button>
          )}
          <Button
            variant="secondary"
            block
            className="justify-start"
            icon={<Flag size={18} />}
            onClick={() => {
              setMenu(false)
              setReportOpen(true)
            }}
          >
            Reportar perfil
          </Button>
          <Button
            variant="danger"
            block
            className="justify-start"
            icon={<ShieldBan size={18} />}
            onClick={() => {
              setMenu(false)
              setBlockOpen(true)
            }}
          >
            Bloquear
          </Button>
        </div>
      </Modal>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={profile.id} />
      <BlockDialog open={blockOpen} onClose={() => setBlockOpen(false)} userId={profile.id} name={name} />
    </>
  )
}
