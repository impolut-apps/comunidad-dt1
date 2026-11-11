import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Button, Card, Input, Select, StickyActions, Textarea, useToast } from '@/components/ui'
import { useAuth, useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import type { AgeRange } from '@/lib/types'
import {
  AvatarInput,
  InterestPicker,
  LocationFields,
  normalizeUsername,
  saveInterests,
  uploadAvatar,
  useUserInterests,
  useUsernameAvailability,
} from './shared'

const ageRanges: AgeRange[] = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+']
const thisYear = new Date().getFullYear()

export function EditProfilePage() {
  const me = useMe()
  const { refreshProfile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const currentInterests = useUserInterests(me.id)

  const [displayName, setDisplayName] = useState(me.display_name ?? '')
  const [username, setUsername] = useState(me.username ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [country, setCountry] = useState(me.country ?? '')
  const [city, setCity] = useState(me.city ?? '')
  const [ageRange, setAgeRange] = useState<AgeRange | ''>(me.age_range ?? '')
  const [bio, setBio] = useState(me.bio ?? '')
  const [t1dSince, setT1dSince] = useState(me.t1d_since ? String(me.t1d_since) : '')
  const [t1dNote, setT1dNote] = useState(me.t1d_note ?? '')
  const [interests, setInterests] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const availability = useUsernameAvailability(username, me.username)

  useEffect(() => {
    if (currentInterests.data) setInterests(currentInterests.data)
  }, [currentInterests.data])

  const valid =
    displayName.trim() && username.length >= 3 && availability !== 'taken' && availability !== 'invalid' && country && city.trim() && interests.length > 0

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    try {
      let avatar_path = me.avatar_path
      if (avatarFile) avatar_path = await uploadAvatar(me.id, avatarFile, me.avatar_path)
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
        .eq('id', me.id)
      if (error) throw error
      await saveInterests(me.id, interests, currentInterests.data ?? [])
      await Promise.all([refreshProfile(), qc.invalidateQueries({ queryKey: ['user-interests', me.id] })])
      toast('Perfil actualizado')
      navigate('/profile')
    } catch (err) {
      toast(friendlyError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 animate-fade-up">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate(-1)} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight">Editar perfil</h1>
      </div>

      <Card className="space-y-5 p-5">
        <AvatarInput path={me.avatar_path} name={displayName} onFile={setAvatarFile} />
        <Input label="Tu nombre" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Input
          label="Nombre de usuario"
          leading={<span className="font-semibold">@</span>}
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(normalizeUsername(e.target.value))}
          error={availability === 'taken' ? 'Ese nombre ya está cogido.' : availability === 'invalid' ? '3–20 caracteres: letras, números o _.' : null}
        />
        <Textarea label="Sobre ti" maxLength={300} showCount value={bio} onChange={(e) => setBio(e.target.value)} />
      </Card>

      <Card className="space-y-5 p-5">
        <h2 className="font-bold">Ubicación</h2>
        <LocationFields country={country} city={city} onCountry={setCountry} onCity={setCity} />
        <Select label="Edad (opcional)" value={ageRange} onChange={(e) => setAgeRange(e.target.value as AgeRange | '')}>
          <option value="">Prefiero no decirlo</option>
          {ageRanges.map((r) => (
            <option key={r} value={r}>
              {r} años
            </option>
          ))}
        </Select>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-bold">Intereses</h2>
        <InterestPicker value={interests} onChange={setInterests} />
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-bold">Mi experiencia T1 (opcional)</h2>
          <p className="mt-1 text-sm text-muted">Visible para miembros. Déjalo vacío si prefieres no compartirlo.</p>
        </div>
        <Input
          label="Desde qué año"
          type="number"
          inputMode="numeric"
          min={1930}
          max={thisYear}
          value={t1dSince}
          onChange={(e) => setT1dSince(e.target.value.slice(0, 4))}
        />
        <Textarea label="En una frase" maxLength={280} showCount className="min-h-20" value={t1dNote} onChange={(e) => setT1dNote(e.target.value)} />
      </Card>

      <StickyActions>
        <Button type="submit" block size="lg" loading={saving} disabled={!valid}>
          Guardar cambios
        </Button>
      </StickyActions>
    </form>
  )
}
