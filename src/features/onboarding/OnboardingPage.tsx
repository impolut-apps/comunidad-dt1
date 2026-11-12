import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, X } from 'lucide-react'
import { Button, Input, Logo, Select, Textarea, useToast } from '@/components/ui'
import { InstallCard } from '@/components/InstallApp'
import { useAuth } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import type { AgeRange } from '@/lib/types'
import {
  AvatarInput,
  InterestPicker,
  LocationFields,
  normalizeUsername,
  saveInterests,
  uploadAvatar,
  useUsernameAvailability,
} from '@/features/profiles/shared'

const ageRanges: AgeRange[] = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+']
const steps = ['Tú', 'Dónde', 'Intereses', 'Sobre ti'] as const
const thisYear = new Date().getFullYear()

export function OnboardingPage() {
  const { session, profile, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const uid = session!.user.id

  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [country, setCountry] = useState(profile?.country ?? 'ES')
  const [city, setCity] = useState(profile?.city ?? '')
  const [ageRange, setAgeRange] = useState<AgeRange | ''>(profile?.age_range ?? '')
  const [interests, setInterests] = useState<number[]>([])
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [t1dSince, setT1dSince] = useState(profile?.t1d_since ? String(profile.t1d_since) : '')
  const [t1dNote, setT1dNote] = useState(profile?.t1d_note ?? '')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  const availability = useUsernameAvailability(username, profile?.username)

  const stepValid = [
    displayName.trim().length >= 1 && availability !== 'taken' && availability !== 'invalid' && username.length >= 3,
    Boolean(country) && city.trim().length >= 1,
    interests.length >= 1,
    true,
  ][step]

  function next() {
    setTouched(true)
    if (!stepValid) return
    setTouched(false)
    if (step < steps.length - 1) setStep(step + 1)
    else void finish()
  }

  async function finish() {
    setSaving(true)
    try {
      let avatar_path = profile?.avatar_path ?? null
      if (avatarFile) avatar_path = await uploadAvatar(uid, avatarFile, avatar_path)

      const since = t1dSince ? Number(t1dSince) : null
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username,
          avatar_path,
          country,
          city: city.trim(),
          age_range: ageRange || null,
          bio: bio.trim() || null,
          t1d_since: since && since >= 1930 && since <= thisYear ? since : null,
          t1d_note: t1dNote.trim() || null,
        })
        .eq('id', uid)
      if (error) throw error
      await saveInterests(uid, interests)
      // Last: mark onboarding complete (the database sets the timestamp and checks the email is verified).
      const { error: doneErr } = await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', uid)
      if (doneErr) throw doneErr
      await refreshProfile()
      toast('¡Te damos la bienvenida! 💙')
      navigate('/discover', { replace: true })
    } catch (e) {
      toast(friendlyError(e), 'error')
      if (/username/.test(String((e as Error).message))) setStep(0)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Atrás">
            <ArrowLeft size={22} />
          </button>
        ) : (
          <Logo />
        )}
        <button onClick={() => void signOut()} className="text-sm font-semibold text-muted hover:text-text">
          Salir
        </button>
      </div>

      <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Progreso">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}>
            <div className={cn('h-1.5 rounded-full transition-colors duration-300', i <= step ? 'bg-primary' : 'bg-border')} />
            <span className={cn('mt-1.5 block text-xs font-semibold', i === step ? 'text-primary-text' : 'text-muted')}>{s}</span>
          </li>
        ))}
      </ol>

      <div key={step} className="mt-8 flex-1 animate-fade-up">
        {step === 0 && (
          <section className="space-y-6">
            <Heading title="Empecemos por ti" text="Así te verá el resto de la comunidad." />
            <AvatarInput path={profile?.avatar_path} name={displayName} onFile={setAvatarFile} />
            <Input
              label="Tu nombre"
              placeholder="Ej. Laura"
              autoComplete="given-name"
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              error={touched && !displayName.trim() ? 'Dinos cómo quieres que te llamen.' : null}
            />
            <Input
              label="Nombre de usuario"
              placeholder="laura_runs"
              leading={<span className="font-semibold">@</span>}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              error={
                availability === 'taken'
                  ? 'Ese nombre ya está cogido.'
                  : availability === 'invalid' || (touched && username.length < 3)
                    ? '3–20 caracteres: letras, números o _.'
                    : null
              }
              hint={<UsernameHint state={availability} />}
            />
          </section>
        )}

        {step === 1 && (
          <section className="space-y-6">
            <Heading title="¿Por dónde te mueves?" text="Para enseñarte gente y planes cerca. Solo ciudad, nunca tu ubicación exacta." />
            <LocationFields
              country={country}
              city={city}
              onCountry={setCountry}
              onCity={setCity}
              errors={{ city: touched && !city.trim() ? 'Indica tu ciudad o zona.' : null }}
            />
            <Select label="Edad (opcional)" value={ageRange} onChange={(e) => setAgeRange(e.target.value as AgeRange | '')}>
              <option value="">Prefiero no decirlo</option>
              {ageRanges.map((r) => (
                <option key={r} value={r}>
                  {r} años
                </option>
              ))}
            </Select>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-6">
            <Heading title="¿Qué te gusta hacer?" text="Elige al menos uno. Te ayudará a encontrar gente afín." />
            <InterestPicker value={interests} onChange={setInterests} />
            {touched && interests.length === 0 && (
              <p className="text-sm text-danger" role="alert">
                Elige al menos un interés.
              </p>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="space-y-6">
            <Heading title="Cuéntanos un poco" text="Todo es opcional. Puedes cambiarlo cuando quieras." />
            <Textarea
              label="Sobre ti"
              placeholder="Me encanta el monte, el café de especialidad y busco gente para jugar al pádel los findes."
              maxLength={300}
              showCount
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            <div className="rounded-card border border-border bg-surface p-4">
              <p className="text-sm font-bold">Tu experiencia con la T1 (opcional)</p>
              <p className="mt-1 text-sm text-muted">
                Solo si te apetece. Lo verán miembros de la comunidad. No pedimos datos médicos.
              </p>
              <div className="mt-4 space-y-4">
                <Input
                  label="Desde qué año"
                  type="number"
                  inputMode="numeric"
                  min={1930}
                  max={thisYear}
                  placeholder={String(thisYear - 10)}
                  value={t1dSince}
                  onChange={(e) => setT1dSince(e.target.value.slice(0, 4))}
                />
                <Textarea
                  label="En una frase"
                  placeholder="Debut a los 12. Hoy corro medias maratones."
                  maxLength={280}
                  showCount
                  className="min-h-20"
                  value={t1dNote}
                  onChange={(e) => setT1dNote(e.target.value)}
                />
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Disappears for good once the app is installed (or opened as the app). */}
      {step === steps.length - 1 && <InstallCard hideWhenInstalled className="mt-6" />}

      <div className="sticky bottom-0 mt-8 bg-bg pt-3">
        <Button block size="lg" onClick={next} loading={saving} disabled={touched && !stepValid}>
          {step < steps.length - 1 ? 'Continuar' : 'Entrar en la comunidad'}
        </Button>
      </div>
    </div>
  )
}

function Heading({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
    </div>
  )
}

function UsernameHint({ state }: { state: ReturnType<typeof useUsernameAvailability> }) {
  if (state === 'checking')
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2 size={14} className="animate-spin" /> Comprobando…
      </span>
    )
  if (state === 'available')
    return (
      <span className="inline-flex items-center gap-1 text-mint-text">
        <Check size={14} /> Disponible
      </span>
    )
  if (state === 'taken')
    return (
      <span className="inline-flex items-center gap-1">
        <X size={14} /> No disponible
      </span>
    )
  return <>Así te encontrarán. Solo minúsculas, números y _.</>
}
