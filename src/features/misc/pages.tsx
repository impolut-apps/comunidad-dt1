import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button, EmptyState, Logo } from '@/components/ui'
import { useAuth } from '@/app/auth'

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
        Tu cuenta ha sido suspendida por incumplir las{' '}
        <Link to="/legal/normas" className="font-semibold text-primary-text">
          normas de la comunidad
        </Link>
        . Si crees que es un error, escríbenos.
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
