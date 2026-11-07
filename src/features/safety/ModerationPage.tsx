import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, EyeOff, Eye, ShieldCheck, Trash2, UserX } from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  StoredImage,
  Textarea,
  VoiceNote,
  useToast,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { ReportTarget } from './safety'
import { StatsPanel } from './StatsPanel'

interface Report {
  id: string
  reporter_id: string
  target_type: ReportTarget
  target_id: string
  reason: string
  details: string | null
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed'
  created_at: string
  resolved_at: string | null
  resolution_note: string | null
  reporter: { username: string; display_name: string } | null
}

interface Preview {
  author_id: string
  text: string
  status?: string
  media_path?: string | null
  media_bucket?: 'avatars' | 'media'
  kind?: 'text' | 'image' | 'audio' | 'sticker'
}

type Action = 'dismiss' | 'hide' | 'restore' | 'suspend_user' | 'delete_activity'

const reasonLabels: Record<string, string> = {
  harassment: 'Acoso',
  spam: 'Spam',
  hate: 'Odio',
  sexual: 'Sexual',
  medical_misinformation: 'Desinformación médica',
  impersonation: 'Suplantación',
  underage: 'Posible menor',
  other: 'Otro',
}
const targetLabels: Record<ReportTarget, string> = {
  user: 'Perfil',
  post: 'Publicación',
  comment: 'Comentario',
  activity: 'Plan',
  message: 'Mensaje',
}
const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function ModerationPage() {
  const [view, setView] = useState<'open' | 'resolved' | 'stats'>('open')
  const reports = useQuery({
    queryKey: ['reports', view],
    enabled: view !== 'stats',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*, reporter:profiles!reports_reporter_id_fkey(username, display_name)')
        .in('status', view === 'open' ? ['open', 'reviewing'] : ['actioned', 'dismissed'])
        .order('created_at', { ascending: view === 'open' })
        .limit(200)
      if (error) throw error
      return data as unknown as Report[]
    },
  })

  // One card per reported item, however many people reported it.
  const cases = useMemo(() => {
    const map = new Map<string, Report[]>()
    for (const r of reports.data ?? []) {
      const key = `${r.target_type}:${r.target_id}`
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return [...map.values()]
  }, [reports.data])

  return (
    <div>
      <PageHeader title="Moderación" subtitle="Reportes y estadísticas de la comunidad" />
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface-muted p-1" role="tablist">
        {(
          [
            ['open', 'Pendientes'],
            ['resolved', 'Resueltos'],
            ['stats', 'Estadísticas'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className={cn(
              'h-10 rounded-xl text-sm font-bold transition-colors',
              view === value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
            )}
          >
            {label}
            {value === 'open' && view === 'open' && cases.length > 0 ? ` (${cases.length})` : ''}
          </button>
        ))}
      </div>

      {view === 'stats' ? (
        <StatsPanel />
      ) : reports.isPending ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : reports.isError ? (
        <ErrorState message="No hemos podido cargar los reportes." onRetry={() => reports.refetch()} />
      ) : cases.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={28} />} title={view === 'open' ? 'Todo en orden' : 'Aún no hay reportes resueltos'}>
          {view === 'open' ? 'No hay reportes pendientes. Revisa esta pantalla a diario, sobre todo en el lanzamiento.' : null}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {cases.map((group) => (
            <li key={`${group[0].target_type}:${group[0].target_id}`}>
              <CaseCard reports={group} resolved={view === 'resolved'} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CaseCard({ reports, resolved }: { reports: Report[]; resolved: boolean }) {
  const toast = useToast()
  const qc = useQueryClient()
  const first = reports[0]
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [note, setNote] = useState('')

  const preview = useQuery({
    queryKey: ['report-preview', first.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_target_preview', { report_id: first.id })
      if (error) throw error
      return data as Preview | null
    },
  })
  const author = useQuery({
    queryKey: ['profile-by-id', preview.data?.author_id],
    enabled: Boolean(preview.data?.author_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_path, status')
        .eq('id', preview.data!.author_id)
        .maybeSingle()
      if (error) throw error
      return data as { id: string; username: string; display_name: string; avatar_path: string | null; status: string } | null
    },
  })

  const moderate = useMutation({
    mutationFn: async (action: Action) => {
      const { error } = await supabase.rpc('moderate_report', { report_id: first.id, action, note: note.trim() || null })
      if (error) throw error
    },
    onSuccess: () => {
      setConfirm(null)
      setNote('')
      toast('Reporte resuelto')
      void qc.invalidateQueries({ queryKey: ['reports'] })
      void qc.invalidateQueries({ queryKey: ['report-preview'] })
    },
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  const type = first.target_type
  const hidden = preview.data?.status === 'hidden'
  const link =
    type === 'post'
      ? `/posts/${first.target_id}`
      : type === 'activity'
        ? `/plans/${first.target_id}`
        : type === 'user' && author.data
          ? `/u/${author.data.username}`
          : null
  const reasons = [...new Set(reports.map((r) => r.reason))]

  const actions: Array<{ action: Action; label: string; icon: typeof Eye; variant: 'secondary' | 'danger' | 'soft' }> = [
    { action: 'dismiss', label: 'Descartar', icon: CheckCircle2, variant: 'secondary' },
    ...(type === 'post' || type === 'comment'
      ? hidden
        ? [{ action: 'restore' as const, label: 'Restaurar', icon: Eye, variant: 'soft' as const }]
        : [{ action: 'hide' as const, label: 'Ocultar', icon: EyeOff, variant: 'soft' as const }]
      : []),
    ...(type === 'activity' ? [{ action: 'delete_activity' as const, label: 'Eliminar plan', icon: Trash2, variant: 'danger' as const }] : []),
    { action: 'suspend_user', label: 'Suspender autor', icon: UserX, variant: 'danger' },
  ]
  const confirmText: Record<Action, string> = {
    dismiss: 'Se marcará como revisado sin tomar medidas.',
    hide: 'El contenido dejará de verse para la comunidad (su autor seguirá viéndolo).',
    restore: 'El contenido volverá a ser visible y los reportes se descartarán.',
    suspend_user: 'La cuenta quedará suspendida: no podrá ver ni publicar nada. Para reactivarla hay que hacerlo desde Supabase.',
    delete_activity: 'El plan se borrará para siempre, con todos sus participantes.',
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="blue">{targetLabels[type]}</Badge>
        {reasons.map((r) => (
          <Badge key={r} tone={r === 'underage' || r === 'harassment' || r === 'hate' ? 'danger' : 'neutral'}>
            {reasonLabels[r] ?? r}
          </Badge>
        ))}
        {hidden && <Badge tone="danger">Oculto</Badge>}
        {author.data?.status === 'suspended' && <Badge tone="danger">Autor suspendido</Badge>}
        <span className="ml-auto text-xs text-muted">
          {reports.length} {reports.length === 1 ? 'reporte' : 'reportes'} · {dateFmt.format(new Date(first.created_at))}
        </span>
      </div>

      <div className="mt-3 rounded-2xl bg-surface-muted p-3">
        {author.data && (
          <div className="mb-2 flex items-center gap-2">
            <Avatar path={author.data.avatar_path} name={author.data.display_name} size="xs" />
            <span className="text-sm font-semibold">{author.data.display_name}</span>
            <span className="text-sm text-muted">@{author.data.username}</span>
          </div>
        )}
        <p className="line-clamp-6 whitespace-pre-wrap break-words text-[15px]">
          {preview.isPending ? 'Cargando…' : (preview.data?.text ?? 'El contenido ya no existe.')}
        </p>
        {preview.data?.media_path && preview.data.kind === 'audio' && (
          <div className="mt-2 w-fit rounded-2xl bg-surface px-3 py-2">
            <VoiceNote path={preview.data.media_path} />
          </div>
        )}
        {preview.data?.media_path && preview.data.kind === 'image' && (
          <div className="mt-2 w-48">
            <StoredImage bucket={preview.data.media_bucket ?? 'media'} path={preview.data.media_path} alt="Imagen reportada" className="rounded-xl" maxHeight={240} />
          </div>
        )}
        {link && (
          <Link to={link} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-text">
            Ver en la app <ExternalLink size={14} />
          </Link>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-sm text-muted">
        {reports.map((r) => (
          <li key={r.id}>
            <span className="font-semibold text-text">@{r.reporter?.username ?? '—'}</span>: {reasonLabels[r.reason] ?? r.reason}
            {r.details && <> — “{r.details}”</>}
          </li>
        ))}
      </ul>

      {resolved ? (
        <p className="mt-3 text-sm text-muted">
          {first.status === 'actioned' ? 'Con medidas' : 'Descartado'}
          {first.resolved_at && ` · ${dateFmt.format(new Date(first.resolved_at))}`}
          {first.resolution_note && ` · “${first.resolution_note}”`}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map(({ action, label, icon: Icon, variant }) => (
            <Button key={action} size="sm" variant={variant} icon={<Icon size={16} />} onClick={() => setConfirm(action)}>
              {label}
            </Button>
          ))}
        </div>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={actions.find((a) => a.action === confirm)?.label ?? ''}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant={confirm === 'suspend_user' || confirm === 'delete_activity' ? 'danger' : 'primary'}
              block
              loading={moderate.isPending}
              onClick={() => confirm && moderate.mutate(confirm)}
            >
              Confirmar
            </Button>
          </>
        }
      >
        {confirm && <p className="text-[15px] text-muted">{confirmText[confirm]}</p>}
        <div className="mt-4">
          <Textarea label="Nota interna (opcional)" maxLength={500} className="min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </Modal>
    </Card>
  )
}
