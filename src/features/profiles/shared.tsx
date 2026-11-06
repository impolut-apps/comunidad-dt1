import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { Avatar, Chip, Input, Select, Skeleton, useToast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { countries, spanishCities } from '@/lib/geo'
import type { Interest } from '@/lib/types'

export const MAX_INTERESTS = 12

export function useInterests() {
  return useQuery({
    queryKey: ['interests'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('interests').select('*').order('sort_order')
      if (error) throw error
      return data as Interest[]
    },
  })
}

export function useUserInterests(userId?: string) {
  return useQuery({
    queryKey: ['user-interests', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('user_interests').select('interest_id').eq('user_id', userId!)
      if (error) throw error
      return data.map((r) => r.interest_id as number)
    },
  })
}

/** Replace a user's interests with the given set (own user only — RLS enforces it). */
export async function saveInterests(userId: string, next: number[], current: number[] = []) {
  const toRemove = current.filter((id) => !next.includes(id))
  const toAdd = next.filter((id) => !current.includes(id))
  if (toRemove.length) {
    const { error } = await supabase.from('user_interests').delete().eq('user_id', userId).in('interest_id', toRemove)
    if (error) throw error
  }
  if (toAdd.length) {
    const { error } = await supabase.from('user_interests').insert(toAdd.map((interest_id) => ({ user_id: userId, interest_id })))
    if (error) throw error
  }
}

export function InterestPicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { data, isPending } = useInterests()
  const toast = useToast()
  if (isPending)
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-full" />
        ))}
      </div>
    )
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Intereses">
      {data?.map((i) => {
        const selected = value.includes(i.id)
        return (
          <Chip
            key={i.id}
            emoji={i.emoji}
            selected={selected}
            onClick={() => {
              if (selected) onChange(value.filter((v) => v !== i.id))
              else if (value.length >= MAX_INTERESTS) toast(`Puedes elegir hasta ${MAX_INTERESTS}`, 'info')
              else onChange([...value, i.id])
            }}
          >
            {i.label_es}
          </Chip>
        )
      })}
    </div>
  )
}

export function LocationFields({
  country,
  city,
  onCountry,
  onCity,
  errors,
}: {
  country: string
  city: string
  onCountry: (v: string) => void
  onCity: (v: string) => void
  errors?: { country?: string | null; city?: string | null }
}) {
  return (
    <div className="space-y-4">
      <Select label="País" value={country} onChange={(e) => onCountry(e.target.value)} error={errors?.country}>
        <option value="">Elige tu país</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>
      <Input
        label="Ciudad o zona"
        placeholder="Ej. Madrid"
        list={country === 'ES' ? 'es-cities' : undefined}
        value={city}
        maxLength={60}
        onChange={(e) => onCity(e.target.value)}
        error={errors?.city}
        hint="Solo la ciudad. Nunca pedimos ni mostramos tu dirección."
        autoComplete="address-level2"
      />
      <datalist id="es-cities">
        {spanishCities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  )
}

/**
 * Re-encodes the photo through a canvas: square crop, max 512px, WebP.
 * This also strips EXIF metadata — including GPS coordinates phones embed in photos.
 */
async function processImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const size = Math.min(512, side)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/webp', 0.86),
  )
}

export async function uploadAvatar(userId: string, file: File, previousPath?: string | null) {
  const blob = await processImage(file)
  const path = `${userId}/avatar-${Date.now()}.webp`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/webp', upsert: false })
  if (error) throw error
  if (previousPath) await supabase.storage.from('avatars').remove([previousPath])
  return path
}

export function AvatarInput({
  path,
  name,
  onFile,
}: {
  path?: string | null
  name?: string | null
  onFile: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const toast = useToast()
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative rounded-full focus-visible:outline-offset-4"
        aria-label="Cambiar foto de perfil"
      >
        <Avatar path={path} name={name || '?'} size="xl" previewUrl={preview} />
        <span className="absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full border-4 border-bg bg-primary text-white transition group-hover:scale-105">
          <Camera size={16} />
        </span>
      </button>
      <div className="text-sm">
        <p className="font-semibold">Foto de perfil</p>
        <p className="text-muted">Opcional. Solo la ven miembros de la comunidad.</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          if (f && f.size > 10 * 1024 * 1024) return toast('La foto es demasiado grande (máx. 10 MB)', 'error')
          onFile(f)
          setPreview(f ? URL.createObjectURL(f) : null)
        }}
      />
    </div>
  )
}

export const usernamePattern = /^[a-z0-9_]{3,20}$/
export function normalizeUsername(v: string) {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

/** Debounced server-side check (the unique index is the real guarantee). */
export function useUsernameAvailability(username: string, currentUsername?: string | null) {
  const [state, setState] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  useEffect(() => {
    if (!username || username === currentUsername) return setState('idle')
    if (!usernamePattern.test(username)) return setState('invalid')
    setState('checking')
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_available', { name: username })
      setState(error ? 'idle' : data ? 'available' : 'taken')
    }, 400)
    return () => clearTimeout(t)
  }, [username, currentUsername])
  return state
}
