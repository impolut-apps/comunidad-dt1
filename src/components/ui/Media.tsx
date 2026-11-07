import { useEffect, useRef, useState } from 'react'
import { ImageOff, Pause, Play, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useSignedUrl, type Bucket, type ImageMeta } from '@/lib/media'

/** A photo from a private bucket. Reserves its aspect ratio so the layout doesn't jump. Tap to enlarge. */
export function StoredImage({
  bucket = 'media',
  path,
  meta,
  alt,
  className,
  maxHeight = 360,
}: {
  bucket?: Bucket
  path: string
  meta?: ImageMeta | null
  alt: string
  className?: string
  maxHeight?: number
}) {
  const url = useSignedUrl(bucket, path)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const ratio = meta?.w && meta?.h ? meta.w / meta.h : 4 / 3

  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        className={cn('relative block w-full overflow-hidden bg-surface-muted', className)}
        style={{ aspectRatio: String(ratio), maxHeight }}
        aria-label="Ver foto a pantalla completa"
      >
        {failed ? (
          <span className="flex size-full items-center justify-center text-muted">
            <ImageOff size={24} />
          </span>
        ) : url ? (
          <img src={url} alt={alt} className="size-full object-cover" loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <span className="block size-full animate-pulse" />
        )}
      </button>
      {open && url && <Lightbox url={url} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}

export function Lightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal aria-label={alt} onClick={onClose}>
      <img src={url} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" />
      <button onClick={onClose} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/15 p-2.5 text-white" aria-label="Cerrar">
        <X size={22} />
      </button>
    </div>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Compact voice-note player (play/pause, progress, duration). */
export function VoiceNote({ path, duration, mine }: { path: string; duration?: number; mine?: boolean }) {
  const url = useSignedUrl('media', path)
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [total, setTotal] = useState(duration ?? 0)
  const [error, setError] = useState(false)

  function toggle() {
    const a = audio.current
    if (!a) return
    if (a.paused) a.play().catch(() => setError(true))
    else a.pause()
  }

  return (
    <div className="flex w-56 max-w-full items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={!url || error}
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50',
          mine ? 'text-white' : 'text-muted',
        )}
        aria-label={playing ? 'Pausar audio' : 'Reproducir audio'}
      >
        {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-4 items-center">
          <div className={cn('h-1 w-full rounded-full', mine ? 'bg-white/35' : 'bg-border')} />
          <div className={cn('absolute left-0 h-1 rounded-full', mine ? 'bg-white' : 'bg-primary')} style={{ width: `${total ? (time / total) * 100 : 0}%` }} />
          <span
            className={cn('absolute size-3.5 -translate-x-1/2 rounded-full shadow', mine ? 'bg-white' : 'bg-electric')}
            style={{ left: `${total ? (time / total) * 100 : 0}%` }}
            aria-hidden
          />
        </div>
        <p className={cn('mt-0.5 text-[11px] tabular-nums', mine ? 'text-white/80' : 'text-muted')}>
          {error ? 'No se puede reproducir en este navegador' : mmss(playing || time ? time : total)}
        </p>
      </div>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setTime(0)
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setTotal(e.currentTarget.duration)}
          onError={() => setError(true)}
        />
      )}
    </div>
  )
}
