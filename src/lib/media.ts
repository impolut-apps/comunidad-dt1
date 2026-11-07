import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Bucket = 'avatars' | 'media'

// Private buckets: files are read through short-lived signed URLs, cached for their lifetime.
const cache = new Map<string, { url: string; expires: number }>()
const TTL = 60 * 60 // seconds

export async function signedUrl(bucket: Bucket, path: string) {
  const key = `${bucket}/${path}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, TTL)
  if (!data?.signedUrl) return null
  cache.set(key, { url: data.signedUrl, expires: Date.now() + (TTL - 60) * 1000 })
  return data.signedUrl
}

export function useSignedUrl(bucket: Bucket, path?: string | null) {
  const [url, setUrl] = useState<string | null>(() => (path ? (cache.get(`${bucket}/${path}`)?.url ?? null) : null))
  useEffect(() => {
    let alive = true
    if (!path) {
      setUrl(null)
      return
    }
    signedUrl(bucket, path).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [bucket, path])
  return url
}

export interface ImageMeta {
  w: number
  h: number
}

/**
 * Resizes and re-encodes a photo to WebP in the browser. Keeps uploads small (free-tier storage)
 * and strips EXIF metadata — including the GPS position phones embed in photos.
 */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<{ blob: Blob; meta: ImageMeta }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/webp', quality),
  )
  return { blob, meta: { w, h } }
}

export async function uploadMedia(path: string, blob: Blob, contentType: string) {
  const { error } = await supabase.storage.from('media').upload(path, blob, { contentType, upsert: false })
  if (error) throw error
  return path
}

export const newFileId = () => crypto.randomUUID()

export const MAX_PHOTO_INPUT_BYTES = 25 * 1024 * 1024 // before compression
