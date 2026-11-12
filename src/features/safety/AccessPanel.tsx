import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, DoorClosed, DoorOpen, Pencil, Ticket } from 'lucide-react'
import { Badge, Button, Card, CardSkeleton, ErrorState, Input, Modal, useToast } from '@/components/ui'
import { supabase, siteUrl } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { useSignupMode, type SignupMode } from '@/features/auth/useSignupMode'

import { CommunitySelect, InviteCodeEditor, UNLIMITED, type InviteCode } from './InviteCodeEditor'
import { CommunitiesPanel } from './CommunitiesPanel'

const modes: Array<{ value: SignupMode; label: string; text: string; icon: typeof DoorOpen }> = [
  { value: 'open', label: 'Abierto', text: 'Cualquier adulto puede registrarse.', icon: DoorOpen },
  { value: 'invite', label: 'Con invitación', text: 'Solo quien tenga un código válido.', icon: Ticket },
  { value: 'closed', label: 'Cerrado', text: 'Nadie puede crear cuenta. Quien ya la tiene, entra normal.', icon: DoorClosed },
]
const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

/** Moderators: the sign-up switch (emergency brake) and invite codes. */
export function AccessPanel() {
  const toast = useToast()
  const qc = useQueryClient()
  const { mode, loading } = useSignupMode()
  const [pending, setPending] = useState<SignupMode | null>(null)
  const [count, setCount] = useState('10')
  const [uses, setUses] = useState('1')
  const [note, setNote] = useState('')
  const [days, setDays] = useState('')
  const [editing, setEditing] = useState<InviteCode | null>(null)

  const codes = useQuery({
    queryKey: ['invite-codes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_invite_codes')
      if (error) throw error
      return data as InviteCode[]
    },
  })

  const setMode = useMutation({
    mutationFn: async (m: SignupMode) => {
      const { error } = await supabase.rpc('set_signup_mode', { p_mode: m })
      if (error) throw error
      return m
    },
    onSuccess: (m) => {
      setPending(null)
      void qc.invalidateQueries({ queryKey: ['signup-mode'] })
      toast(`Registro: ${modes.find((x) => x.value === m)?.label.toLowerCase()}`)
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  const generate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('generate_invite_codes', {
        p_count: Math.min(Math.max(Number(count) || 1, 1), 100),
        p_max_uses: Math.min(Math.max(Number(uses) || 1, 1), 1000),
        p_note: note.trim() || null,
        p_days: days ? Number(days) : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast('Códigos creados')
      setNote('')
      void qc.invalidateQueries({ queryKey: ['invite-codes'] })
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  const [custom, setCustom] = useState('')
  const [customUses, setCustomUses] = useState('')
  const [customDays, setCustomDays] = useState('')
  const [customNote, setCustomNote] = useState('')
  const [customCommunity, setCustomCommunity] = useState('')
  const createCustom = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_invite_code', {
        p_code: custom,
        p_max_uses: customUses ? Math.min(Math.max(Number(customUses) || 1, 1), UNLIMITED) : UNLIMITED,
        p_note: customNote.trim() || null,
        p_days: customDays ? Number(customDays) : null,
        p_community: customCommunity || null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (code) => {
      setCustom('')
      setCustomUses('')
      setCustomDays('')
      setCustomNote('')
      setCustomCommunity('')
      void qc.invalidateQueries({ queryKey: ['invite-codes'] })
      void copyLink(code, `Código ${code} creado. Enlace copiado`)
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  async function copyLink(code: string, message = 'Enlace de invitación copiado') {
    const link = `${siteUrl}/signup?invite=${code}`
    try {
      await navigator.clipboard.writeText(link)
      toast(message)
    } catch {
      toast(link, 'info')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Registro de nuevas cuentas</h2>
        <p className="mt-1 text-sm text-muted">El freno de emergencia: el cambio es inmediato y no hace falta publicar nada.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modo de registro">
          {modes.map(({ value, label, text, icon: Icon }) => {
            const active = !loading && mode === value
            return (
              <button
                key={value}
                role="radio"
                aria-checked={active}
                onClick={() => !active && setPending(value)}
                className={cn(
                  'rounded-2xl border p-3 text-left transition-colors',
                  active ? 'border-primary bg-primary-soft text-primary-soft-text' : 'border-border hover:bg-surface-muted',
                )}
              >
                <span className="flex items-center gap-2 font-bold">
                  <Icon size={18} /> {label}
                </span>
                <span className="mt-1 block text-xs opacity-80">{text}</span>
              </button>
            )
          })}
        </div>
      </Card>

      <CommunitiesPanel />

      <Card className="p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Código personalizado</h2>
        <p className="mt-1 text-sm text-muted">
          Para influencers, asociaciones o eventos: «regístrate con el código CARLOS». Funciona también con el registro abierto
          y verás cuántas personas han entrado con cada código.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input
            label="Código"
            placeholder="CARLOS"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={custom}
            onChange={(e) => setCustom(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24))}
          />
          <Input label="Usos máximos" type="number" min={1} placeholder="Sin límite" value={customUses} onChange={(e) => setCustomUses(e.target.value)} />
          <Input label="Caduca en (días)" type="number" min={1} placeholder="Nunca" value={customDays} onChange={(e) => setCustomDays(e.target.value)} />
          <Input label="Nota" placeholder="Ej. Instagram de Carlos" maxLength={80} value={customNote} onChange={(e) => setCustomNote(e.target.value)} />
        </div>
        <div className="mt-3 sm:max-w-xs">
          <CommunitySelect value={customCommunity} onChange={setCustomCommunity} />
        </div>
        <Button className="mt-3" icon={<Ticket size={17} />} loading={createCustom.isPending} disabled={custom.length < 3} onClick={() => createCustom.mutate()}>
          Crear código
        </Button>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Invitaciones aleatorias</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input label="Cuántos" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} />
          <Input label="Usos por código" type="number" min={1} max={1000} value={uses} onChange={(e) => setUses(e.target.value)} />
          <Input label="Caduca en (días)" type="number" min={1} placeholder="Nunca" value={days} onChange={(e) => setDays(e.target.value)} />
          <Input label="Nota" placeholder="Ej. Embajadora Madrid" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button className="mt-3" icon={<Ticket size={17} />} loading={generate.isPending} onClick={() => generate.mutate()}>
          Crear códigos
        </Button>
        <p className="mt-2 text-xs text-muted">
          Un código con muchos usos sirve como enlace de grupo (p. ej. para una asociación); uno de un solo uso, para una persona.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Invitaciones creadas</h2>
        {codes.isPending ? (
          <CardSkeleton />
        ) : codes.isError ? (
          <ErrorState message="No hemos podido cargar los códigos." onRetry={() => codes.refetch()} />
        ) : codes.data.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Todavía no hay códigos.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {codes.data.map((c) => {
              const expired = c.expires_at && new Date(c.expires_at) <= new Date()
              const used = c.uses >= c.max_uses
              return (
                <li key={c.code} className="flex items-center gap-2 py-2.5">
                  <button onClick={() => setEditing(c)} className="min-w-0 flex-1 text-left" aria-label={`Editar ${c.code}`}>
                    <p className="font-mono text-sm font-bold">{c.code}</p>
                    <p className="truncate text-xs text-muted">
                      {c.max_uses >= UNLIMITED ? `${c.uses} ${c.uses === 1 ? 'registro' : 'registros'}` : `${c.uses}/${c.max_uses} usos`}
                      {c.expires_at && ` · caduca ${dateFmt.format(new Date(c.expires_at))}`}
                      {c.community_name && ` · → ${c.community_name}`}
                      {c.note && ` · ${c.note}`}
                    </p>
                  </button>
                  {c.disabled_at ? (
                    <Badge>Pausado</Badge>
                  ) : expired ? (
                    <Badge>Caducado</Badge>
                  ) : used ? (
                    <Badge>Agotado</Badge>
                  ) : (
                    <Badge tone="mint">Activo</Badge>
                  )}
                  <Button size="sm" variant="ghost" aria-label={`Copiar enlace de ${c.code}`} onClick={() => copyLink(c.code)}>
                    <Copy size={16} />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Editar ${c.code}`} onClick={() => setEditing(c)}>
                    <Pencil size={16} />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {editing && <InviteCodeEditor key={editing.code} code={editing} onClose={() => setEditing(null)} />}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="¿Cambiar el registro?"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setPending(null)}>
              Cancelar
            </Button>
            <Button variant={pending === 'closed' ? 'danger' : 'primary'} block loading={setMode.isPending} onClick={() => pending && setMode.mutate(pending)}>
              Confirmar
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">
          Pasará a <strong className="text-text">{modes.find((m) => m.value === pending)?.label}</strong>:{' '}
          {modes.find((m) => m.value === pending)?.text}
        </p>
      </Modal>
    </div>
  )
}
