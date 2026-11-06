import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { Button, EmptyState, Logo } from '@/components/ui'
import { useAuth } from '@/app/auth'
import { brand } from '@/lib/brand'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <EmptyState title="Página no encontrada" action={<Link to="/" className="font-semibold text-primary-text">Volver al inicio</Link>}>
        Esta página no existe o se ha movido.
      </EmptyState>
    </div>
  )
}

export function SuspendedPage() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <EmptyState icon={<ShieldAlert size={28} />} title="Cuenta suspendida" action={<Button variant="secondary" onClick={() => void signOut()}>Cerrar sesión</Button>}>
        Tu cuenta ha sido suspendida por incumplir las normas de la comunidad. Si crees que es un error, escríbenos.
      </EmptyState>
    </div>
  )
}

/** Shown when the app is built without Supabase credentials. */
export function SetupRequiredPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <Logo />
      <h1 className="mt-8 text-2xl font-extrabold">Falta configurar Supabase</h1>
      <p className="mt-2 text-muted">
        Copia <code className="rounded bg-surface-muted px-1.5">.env.example</code> a{' '}
        <code className="rounded bg-surface-muted px-1.5">.env</code> y rellena <code>VITE_SUPABASE_URL</code> y{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>. Consulta el README.
      </p>
    </div>
  )
}

/**
 * PLACEHOLDER legal pages. These texts must be written and reviewed by a lawyer
 * before public launch — see DEVELOPMENT_PLAN.md §7.
 */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const navigate = useNavigate()
  const title = kind === 'terms' ? 'Condiciones de uso' : 'Política de privacidad'
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <button onClick={() => navigate(-1)} className="-ml-2 mb-4 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
        <ArrowLeft size={22} />
      </button>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <div className="mt-4 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
        Borrador provisional. Este texto debe ser redactado y revisado por un profesional legal antes del lanzamiento.
      </div>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted">
        {kind === 'privacy' ? (
          <>
            <p>
              {brand.name} es una comunidad social para adultos que viven con diabetes tipo 1. Ser miembro implica un dato
              de salud (categoría especial, art. 9 RGPD), que tratamos solo con tu consentimiento explícito.
            </p>
            <p>
              Datos que tratamos: email, nombre visible, usuario, foto (opcional), país y ciudad, intereses, bio y, si
              quieres, información opcional sobre tu experiencia con la T1. No recogemos ubicación precisa ni datos médicos.
            </p>
            <p>Puedes borrar tu cuenta y todos tus datos en cualquier momento desde Ajustes.</p>
          </>
        ) : (
          <>
            <p>Solo pueden usar {brand.name} personas mayores de 18 años.</p>
            <p>Esto no es un servicio médico. Nada de lo publicado constituye consejo médico.</p>
            <p>Respeta a los demás: no se permite acoso, odio, spam, contenido sexual ni suplantación.</p>
          </>
        )}
      </div>
    </div>
  )
}
