import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'

// Avatars are in a private bucket. Signed URLs are cached in memory for their lifetime.
const cache = new Map<string, { url: string; expires: number }>()
const TTL = 60 * 60 // seconds

async function signedUrl(path: string) {
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data } = await supabase.storage.from('avatars').createSignedUrl(path, TTL)
  if (!data?.signedUrl) return null
  cache.set(path, { url: data.signedUrl, expires: Date.now() + (TTL - 60) * 1000 })
  return data.signedUrl
}

export function useAvatarUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(() => (path ? (cache.get(path)?.url ?? null) : null))
  useEffect(() => {
    let alive = true
    if (!path) {
      setUrl(null)
      return
    }
    signedUrl(path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [path])
  return url
}

// Deterministic, friendly background per person (blue family + mint).
const palettes = [
  'bg-[#DCEBFF] text-[#0E4FA3]',
  'bg-[#4B91ED] text-white',
  'bg-[#1268D5] text-white',
  'bg-[#8ADCC3] text-[#142238]',
  'bg-[#142238] text-white',
]
function paletteFor(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return palettes[h % palettes.length]
}

const sizes = {
  xs: 'size-8 text-xs',
  sm: 'size-10 text-sm',
  md: 'size-12 text-base',
  lg: 'size-16 text-xl',
  xl: 'size-24 text-3xl',
}

export function Avatar({
  path,
  name,
  size = 'md',
  className,
  previewUrl,
}: {
  path?: string | null
  name?: string | null
  size?: keyof typeof sizes
  className?: string
  previewUrl?: string | null
}) {
  const signed = useAvatarUrl(previewUrl ? null : path)
  const src = previewUrl ?? signed
  const initials = (name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold',
        sizes[size],
        !src && paletteFor(name ?? '?'),
        className,
      )}
    >
      {src ? (
        <img src={src} alt={name ? `Foto de ${name}` : ''} className="size-full object-cover" loading="lazy" />
      ) : (
        <span aria-hidden>{initials || '?'}</span>
      )}
    </span>
  )
}
