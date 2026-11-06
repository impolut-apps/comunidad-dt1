import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail, Lock, MailCheck } from 'lucide-react'
import { Button, Input, useToast } from '@/components/ui'
import { supabase, siteUrl } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { AuthLayout } from './AuthLayout'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${siteUrl}/reset-password` })
    setLoading(false)
    // Same message whether or not the account exists, so emails cannot be enumerated.
    if (error && !/not found/i.test(error.message)) return setError(friendlyError(error))
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout
        title="Revisa tu email"
        subtitle={`Si existe una cuenta con ${email}, te hemos enviado un enlace para crear una contraseña nueva.`}
      >
        <Link to="/login" className="font-semibold text-primary-text hover:underline">
          Volver a iniciar sesión
        </Link>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Recupera tu contraseña" subtitle="Te enviaremos un enlace para crear una nueva.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          leading={<Mail size={18} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" block size="lg" loading={loading}>
          Enviar enlace
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" className="font-semibold text-primary-text hover:underline">
            Volver
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}

/** Reached from the recovery email; Supabase signs the user in with a recovery session. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY' || s) setHasSession(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(friendlyError(error))
    toast('Contraseña actualizada')
    navigate('/home', { replace: true })
  }

  if (hasSession === false) {
    return (
      <AuthLayout title="Enlace no válido" subtitle="El enlace ha caducado o ya se ha usado. Pide uno nuevo.">
        <Button onClick={() => navigate('/forgot-password')}>Pedir otro enlace</Button>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Nueva contraseña">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          leading={<Lock size={18} />}
          hint="Mínimo 8 caracteres."
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" block size="lg" loading={loading} disabled={password.length < 8 || !hasSession}>
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  )
}

export function VerifyEmailPage() {
  const email = (useLocation().state as { email?: string } | null)?.email
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function resend() {
    if (!email) return
    setLoading(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${siteUrl}/onboarding` } })
    setLoading(false)
    toast(error ? friendlyError(error) : 'Te lo hemos vuelto a enviar', error ? 'error' : 'success')
  }

  return (
    <AuthLayout
      title="Confirma tu email"
      subtitle={
        <>
          Te hemos enviado un enlace{email ? <> a <strong className="text-text">{email}</strong></> : null}. Ábrelo para
          activar tu cuenta y empezar.
        </>
      }
    >
      <div className="flex size-16 items-center justify-center rounded-3xl bg-primary-soft text-primary-soft-text">
        <MailCheck size={30} />
      </div>
      <p className="mt-6 text-sm text-muted">¿No lo ves? Mira en la carpeta de spam o promociones.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {email && (
          <Button variant="secondary" onClick={resend} loading={loading}>
            Reenviar email
          </Button>
        )}
        <Button variant="ghost" onClick={() => (window.location.href = '/login')}>
          Ya lo he confirmado
        </Button>
      </div>
    </AuthLayout>
  )
}
