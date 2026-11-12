import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Button, Input, Modal, Select, Switch, useToast } from '@/components/ui'
import { useCommunities } from '@/features/communities/api'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'

export interface InviteCode {
  code: string
  note: string | null
  max_uses: number
  uses: number
  expires_at: string | null
  created_at: string
  disabled_at: string | null
  community_id?: string | null
  community_name?: string | null
}

/** Pick which community (if any) a code drops new members into. */
export function CommunitySelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const communities = useCommunities()
  return (
    <Select label="Comunidad" value={value} onChange={(e) => onChange(e.target.value)} hint="Quien se registre con el código entrará en ella.">
      <option value="">Ninguna</option>
      {communities.data?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.emoji ? `${c.emoji} ` : ''}
          {c.name}
        </option>
      ))}
    </Select>
  )
}

export const UNLIMITED = 1_000_000

/** yyyy-mm-dd in local time, for <input type="date">. */
function toDateInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Edit the cap, expiry, note and paused state of one code, or delete it. */
export function InviteCodeEditor({ code, onClose }: { code: InviteCode; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [maxUses, setMaxUses] = useState(code.max_uses >= UNLIMITED ? '' : String(code.max_uses))
  const [expires, setExpires] = useState(toDateInput(code.expires_at))
  const [note, setNote] = useState(code.note ?? '')
  const [active, setActive] = useState(!code.disabled_at)
  const [community, setCommunity] = useState(code.community_id ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const done = (message: string) => {
    void qc.invalidateQueries({ queryKey: ['invite-codes'] })
    toast(message)
    onClose()
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('update_invite_code', {
        p_code: code.code,
        p_max_uses: maxUses ? Number(maxUses) : UNLIMITED,
        p_note: note.trim() || null,
        // End of the chosen day, local time.
        p_expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
        p_active: active,
        p_community: community || null,
      })
      if (error) throw error
    },
    onSuccess: () => done(`Código ${code.code} actualizado`),
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_invite_code', { p_code: code.code })
      if (error) throw error
    },
    onSuccess: () => done(`Código ${code.code} eliminado`),
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  if (confirmDelete)
    return (
      <Modal
        open
        onClose={() => setConfirmDelete(false)}
        title={`¿Eliminar ${code.code}?`}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>
              Volver
            </Button>
            <Button variant="danger" block loading={remove.isPending} onClick={() => remove.mutate()}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">
          El código dejará de funcionar
          {code.uses > 0 && (
            <>
              {' '}y perderás el recuento de las <strong className="text-text">{code.uses} personas</strong> que se registraron con él
              (sus cuentas no se tocan)
            </>
          )}
          . Si solo quieres que deje de funcionar y conservar los números, mejor <strong className="text-text">páusalo</strong>.
        </p>
      </Modal>
    )

  return (
    <Modal
      open
      onClose={onClose}
      title={`Editar ${code.code}`}
      footer={
        <>
          <Button variant="danger" icon={<Trash2 size={17} />} onClick={() => setConfirmDelete(true)} aria-label="Eliminar código" />
          <Button variant="secondary" block onClick={onClose}>
            Cancelar
          </Button>
          <Button block loading={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {code.uses} {code.uses === 1 ? 'persona se ha registrado' : 'personas se han registrado'} con este código. El texto del código no
          se puede cambiar porque ya puede estar compartido.
        </p>
        <Switch
          label="Activo"
          description="Si lo pausas, nadie más podrá registrarse con él hasta que lo reactives."
          checked={active}
          onChange={setActive}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Usos máximos"
            type="number"
            min={Math.max(code.uses, 1)}
            placeholder="Sin límite"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
          <Input label="Caduca el" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} hint="Vacío: nunca." />
        </div>
        <Input label="Nota" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
        <CommunitySelect value={community} onChange={setCommunity} />
      </div>
    </Modal>
  )
}
