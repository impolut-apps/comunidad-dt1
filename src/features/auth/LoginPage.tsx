import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) {
      if (/not confirmed/i.test(error.message)) return navigate('/verify-email', { state: { email: email.trim() } })
      return setError(friendlyError(error))
    }
    navigate(from ?? '/home', { replace: true })
  }

  return (
    <AuthLayout title="Hola de nuevo" subtitle="Tu gente te está esperando.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          leading={<Mail size={18} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          leading={<Lock size={18} />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-primary-text hover:underline">
            ¿Has olvidado tu contraseña?
          </Link>
        </div>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" block size="lg" loading={loading}>
          Entrar
        </Button>
        <p className="text-center text-sm text-muted">
          ¿Aún no tienes cuenta?{' '}
          <Link to="/signup" className="font-semibold text-primary-text hover:underline">
            Únete
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
