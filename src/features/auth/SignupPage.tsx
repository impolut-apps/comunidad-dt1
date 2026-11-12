import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Mail, Lock, Ticket, DoorClosed } from 'lucide-react'
import { Button, Checkbox, EmptyState, Input, PageSpinner } from '@/components/ui'
import { supabase, siteUrl } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { brand } from '@/lib/brand'
import { AuthLayout } from './AuthLayout'
import { InstallCard } from '@/components/InstallApp'
import { useSignupMode } from './useSignupMode'

/** Bump when the legal texts change; stored with each user's consent. */
export const CONSENT_VERSION = '2026-11-v1'

export function SignupPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { mode, loading: modeLoading } = useSignupMode()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Invite links look like /signup?invite=T1-XXXXXXXX
  const [inviteCode, setInviteCode] = useState((params.get('invite') ?? '').toUpperCase())
  const [adult, setAdult] = useState(false)
  const [terms, setTerms] = useState(false)
  const [health, setHealth] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const needsInvite = mode === 'invite'
  // With sign-up open the code is optional ("regístrate con el código CARLOS"), but still counted.
  const [showCode, setShowCode] = useState(Boolean(params.get('invite')))
  const codeVisible = needsInvite || showCode
  // "Entrarás en La tribu de Carlos" when the code is linked to a community.
  const typedCode = codeVisible ? inviteCode.trim() : ''
  const linkedCommunity = useQuery({
    queryKey: ['invite-community', typedCode],
    enabled: typedCode.length >= 3,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('invite_code_community', { p_code: typedCode })
      return (data as string | null) ?? null
    },
  })
  const canSubmit =adult && terms && health && email && password.length >= 8 && (!needsInvite || inviteCode.trim().length >= 3)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    const code = codeVisible ? inviteCode.trim().toUpperCase() : ''
    if (code) {
      // Clear message up front; the database enforces it anyway (handle_new_user trigger).
      const { data: valid } = await supabase.rpc('check_invite_code', { p_code: code })
      if (!valid) {
        setLoading(false)
        return setError(friendlyError('invalid_invite'))
      }
    }
    // The database rejects the sign-up if any consent is missing or the invite is invalid.
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
          ...(code ? { invite_code: code } : {}),
        },
      },
    })
    setLoading(false)
    if (error) return setError(friendlyError(error))
    navigate('/verify-email', { state: { email: email.trim() } })
  }

  if (modeLoading) return <PageSpinner />

  if (mode === 'closed')
    return (
      <AuthLayout title="Volvemos enseguida" subtitle="El registro está cerrado de momento.">
        <EmptyState icon={<DoorClosed size={28} />} title="No se pueden crear cuentas ahora mismo" className="px-0">
          Estamos haciendo ajustes para recibirte como mereces. Si ya tienes cuenta, puedes entrar con normalidad.
        </EmptyState>
        <Button block size="lg" onClick={() => navigate('/login')}>
          Ya tengo cuenta
        </Button>
      </AuthLayout>
    )

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle={needsInvite ? `Ahora mismo entramos con invitación. Tardas menos de dos minutos.` : `Únete a ${brand.name}. Tardas menos de dos minutos.`}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {!codeVisible && (
          <button
            type="button"
            onClick={() => setShowCode(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-text hover:underline"
          >
            <Ticket size={16} /> ¿Tienes un código?
          </button>
        )}
        {codeVisible && (
          <Input
            label={needsInvite ? 'Código de invitación' : 'Código (opcional)'}
            placeholder={needsInvite ? 'T1-XXXXXXXX' : 'Ej. CARLOS'}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            leading={<Ticket size={18} />}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24))}
            hint={
              linkedCommunity.data ? (
                <span className="font-semibold text-mint-text">✓ Entrarás directamente en {linkedCommunity.data}</span>
              ) : needsInvite ? (
                'Te lo ha dado alguien de la comunidad o el equipo.'
              ) : (
                'Si alguien te ha recomendado la app con un código, escríbelo aquí.'
              )
            }
          />
        )}
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
      <InstallCard className="mt-6" />
    </AuthLayout>
  )
}
