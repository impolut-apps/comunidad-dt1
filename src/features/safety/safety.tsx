import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Modal, Textarea, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'

export type ReportTarget = 'user' | 'post' | 'comment' | 'activity' | 'message'

const reasons = [
  { value: 'harassment', label: 'Acoso o intimidación' },
  { value: 'spam', label: 'Spam o publicidad' },
  { value: 'hate', label: 'Odio o discriminación' },
  { value: 'sexual', label: 'Contenido sexual' },
  { value: 'medical_misinformation', label: 'Desinformación médica peligrosa' },
  { value: 'impersonation', label: 'Suplantación de identidad' },
  { value: 'underage', label: 'Parece menor de 18 años' },
  { value: 'other', label: 'Otro motivo' },
] as const

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean
  onClose: () => void
  targetType: ReportTarget
  targetId: string
}) {
  const me = useMe()
  const toast = useToast()
  const [reason, setReason] = useState<string>('')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    setSending(true)
    const { error } = await supabase.from('reports').insert({
      reporter_id: me.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() || null,
    })
    setSending(false)
    if (error && !/reports_one_per_target/.test(error.message)) return toast(friendlyError(error), 'error')
    toast('Gracias. Nuestro equipo lo revisará.')
    setReason('')
    setDetails('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reportar"
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            Cancelar
          </Button>
          <Button block disabled={!reason} loading={sending} onClick={submit}>
            Enviar reporte
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">Es confidencial: la otra persona no sabrá que la has reportado.</p>
      <div className="space-y-2" role="radiogroup" aria-label="Motivo">
        {reasons.map((r) => (
          <button
            key={r.value}
            role="radio"
            aria-checked={reason === r.value}
            onClick={() => setReason(r.value)}
            className={cn(
              'w-full rounded-2xl border px-4 py-3 text-left text-[15px] font-medium transition-colors',
              reason === r.value ? 'border-primary bg-primary-soft text-primary-soft-text' : 'border-border hover:bg-surface-muted',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <Textarea
          label="Detalles (opcional)"
          maxLength={1000}
          className="min-h-20"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </div>
    </Modal>
  )
}

export function BlockDialog({
  open,
  onClose,
  userId,
  name,
}: {
  open: boolean
  onClose: () => void
  userId: string
  name: string
}) {
  const me = useMe()
  const toast = useToast()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [sending, setSending] = useState(false)

  async function block() {
    setSending(true)
    const { error } = await supabase.from('blocked_users').insert({ blocker_id: me.id, blocked_id: userId })
    setSending(false)
    if (error && !/duplicate key/.test(error.message)) return toast(friendlyError(error), 'error')
    // Their content disappears everywhere; drop every cached query that may include it.
    await qc.invalidateQueries()
    toast(`Has bloqueado a ${name}`)
    onClose()
    navigate('/discover', { replace: true })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`¿Bloquear a ${name}?`}
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" block loading={sending} onClick={block}>
            Bloquear
          </Button>
        </>
      }
    >
      <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted">
        <li>No podréis ver vuestros perfiles, publicaciones ni planes.</li>
        <li>No podréis enviaros mensajes y se eliminará vuestra conexión.</li>
        <li>No le avisaremos. Puedes desbloquear desde Ajustes.</li>
      </ul>
    </Modal>
  )
}
