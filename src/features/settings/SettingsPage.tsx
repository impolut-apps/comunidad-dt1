import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronRight, FileText, LifeBuoy, LogOut, Moon, Shield, ShieldBan, Sun, SunMoon, Trash2 } from 'lucide-react'
import { Button, Card, Input, Modal, Switch, useToast } from '@/components/ui'
import { InstallCard } from '@/components/InstallApp'
import { useAuth, useMe } from '@/app/auth'
import { useTheme, type ThemePref } from '@/app/theme'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'

const themes: Array<{ value: ThemePref; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: SunMoon },
]

export function SettingsPage() {
  const me = useMe()
  const { signOut, session } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const toast = useToast()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const { refreshProfile } = useAuth()
  const [savingVisibility, setSavingVisibility] = useState(false)
  async function setDiscoverable(value: boolean) {
    setSavingVisibility(true)
    const { error } = await supabase.from('profiles').update({ discoverable: value }).eq('id', me.id)
    if (!error) await refreshProfile()
    setSavingVisibility(false)
    toast(error ? friendlyError(error) : value ? 'Vuelves a aparecer en Descubrir' : 'Ya no apareces en Descubrir', error ? 'error' : 'success')
  }

  async function deleteAccount() {
    setDeleting(true)
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
    setDeleting(false)
    if (error) return toast(friendlyError(error), 'error')
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight">Ajustes</h1>
      </div>

      <InstallCard always />

      <Card className="p-5">
        <h2 className="font-bold">Apariencia</h2>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-sm font-semibold transition-colors',
                theme === value ? 'border-primary bg-primary-soft text-primary-soft-text' : 'border-border hover:bg-surface-muted',
              )}
            >
              <Icon size={20} /> {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-bold">Privacidad</h2>
        <Switch
          label="Aparecer en Descubrir"
          description="Si lo desactivas, no aparecerás en búsquedas ni sugerencias. Quien ya te conozca podrá seguir viendo tu perfil y escribirte."
          checked={me.discoverable ?? true}
          disabled={savingVisibility}
          onChange={setDiscoverable}
        />
      </Card>

      <Card className="divide-y divide-border overflow-hidden">
        <Row to="/ayuda" icon={LifeBuoy} label="¿Necesitas ayuda ahora?" />
        {me.is_moderator && (
          // On desktop moderation is already in the sidebar.
          <div className="lg:hidden">
            <Row to="/moderation" icon={Shield} label="Moderación" />
          </div>
        )}
        <Row to="/settings/blocked" icon={ShieldBan} label="Personas bloqueadas" />
        <Row to="/legal/normas" icon={FileText} label="Normas de la comunidad" />
        <Row to="/legal/privacy" icon={FileText} label="Política de privacidad" />
        <Row to="/legal/terms" icon={FileText} label="Condiciones de uso" />
      </Card>

      <Card className="p-5">
        <p className="text-sm text-muted">
          Sesión iniciada como <strong className="text-text">{session?.user.email}</strong> (@{me.username})
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" icon={<LogOut size={18} />} onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
          <Button variant="danger" icon={<Trash2 size={18} />} onClick={() => setDeleteOpen(true)}>
            Borrar mi cuenta
          </Button>
        </div>
      </Card>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="¿Borrar tu cuenta?"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" block loading={deleting} disabled={confirmText !== me.username} onClick={deleteAccount}>
              Borrar para siempre
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-relaxed text-muted">
          Se borrarán tu perfil, fotos, publicaciones, planes y mensajes. No se puede deshacer.
        </p>
        <div className="mt-4">
          <Input
            label={`Escribe ${me.username} para confirmar`}
            autoCapitalize="none"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.trim().toLowerCase())}
          />
        </div>
      </Modal>
    </div>
  )
}

function Row({ to, icon: Icon, label }: { to: string; icon: typeof Sun; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-5 py-4 text-[15px] font-semibold hover:bg-surface-muted">
      <Icon size={20} className="text-muted" />
      <span className="flex-1">{label}</span>
      <ChevronRight size={18} className="text-muted" />
    </Link>
  )
}
