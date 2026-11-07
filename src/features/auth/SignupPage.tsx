import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock } from 'lucide-react'
import { Button, Checkbox, Input } from '@/components/ui'
import { supabase, siteUrl } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { brand } from '@/lib/brand'
import { AuthLayout } from './AuthLayout'

/** Bump when the legal texts change; stored with each user's consent. */
export const CONSENT_VERSION = '2026-11-v1'

export function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adult, setAdult] = useState(false)
  const [terms, setTerms] = useState(false)
  const [health, setHealth] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const canSubmit = adult && terms && health && email && password.length >= 8

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    // The database rejects the sign-up if any consent is missing (handle_new_user trigger).
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${siteUrl}/onboarding`,
        data: {
          adult_confirmed: adult,
          terms_accepted: terms,
          privacy_accepted: terms,
          health_data_consent: health,
          consent_version: CONSENT_VERSION,
        },
      },
    })
    setLoading(false)
    if (error) return setError(friendlyError(error))
    navigate('/verify-email', { state: { email: email.trim() } })
  }

  return (
    <AuthLayout title="Crea tu cuenta" subtitle={`Únete a ${brand.name}. Tardas menos de dos minutos.`}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
          autoComplete="new-password"
          leading={<Lock size={18} />}
          hint="Mínimo 8 caracteres."
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <fieldset className="space-y-3 rounded-2xl bg-surface-muted p-4">
          <legend className="sr-only">Consentimientos</legend>
          <Checkbox checked={adult} onChange={setAdult}>
            Tengo <strong>18 años o más</strong>.
          </Checkbox>
          <Checkbox checked={terms} onChange={setTerms}>
            Acepto las{' '}
            <Link to="/legal/terms" target="_blank" className="font-semibold text-primary-text underline-offset-2 hover:underline">
              Condiciones de uso
            </Link>{' '}
            y he leído la{' '}
            <Link to="/legal/privacy" target="_blank" className="font-semibold text-primary-text underline-offset-2 hover:underline">
              Política de privacidad
            </Link>
            , y me comprometo a respetar las{' '}
            <Link to="/legal/normas" target="_blank" className="font-semibold text-primary-text underline-offset-2 hover:underline">
              Normas de la comunidad
            </Link>
            .
          </Checkbox>
          <Checkbox checked={health} onChange={setHealth}>
            Doy mi <strong>consentimiento explícito</strong> para que {brand.name} trate el dato de que vivo con diabetes
            tipo 1, solo para darme acceso a esta comunidad. Puedo retirarlo borrando mi cuenta.
          </Checkbox>
        </fieldset>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" block size="lg" loading={loading} disabled={!canSubmit}>
          Crear cuenta
        </Button>
        <p className="text-center text-sm text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-semibold text-primary-text hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
