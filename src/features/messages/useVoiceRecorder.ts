import { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_VOICE_SECONDS = 120

// Prefer MP4/AAC: it plays everywhere, including iPhone. Fall back to WebM/Ogg Opus (Firefox, older Chrome).
const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

export function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined') return null
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null
}

export const audioExt = (mime: string) => (mime.startsWith('audio/mp4') ? 'm4a' : mime.startsWith('audio/ogg') ? 'ogg' : 'webm')

export interface VoiceClip {
  blob: Blob
  mime: string // without codecs, as stored
  seconds: number
}

/** Records a voice note with the browser's MediaRecorder. Stops automatically at MAX_VOICE_SECONDS. */
export function useVoiceRecorder() {
  const [state, setState] = useState<'idle' | 'recording'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const resolver = useRef<((clip: VoiceClip | null) => void) | null>(null)
  const discard = useRef(false)

  const cleanup = useCallback(() => {
    window.clearInterval(timer.current)
    recorder.current?.stream.getTracks().forEach((t) => t.stop())
    recorder.current = null
    setState('idle')
    setSeconds(0)
  }, [])

  useEffect(() => () => {
    discard.current = true
    if (recorder.current?.state === 'recording') recorder.current.stop()
    cleanup()
  }, [cleanup])

  const start = useCallback(async () => {
    setError(null)
    const mime = pickAudioMime()
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      setError('Tu navegador no permite grabar audio.')
      return false
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      setError('Necesitamos permiso para usar el micrófono.')
      return false
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 })
    chunks.current = []
    discard.current = false
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    rec.onstop = () => {
      const secs = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
      const base = mime.split(';')[0]
      const clip = discard.current ? null : { blob: new Blob(chunks.current, { type: base }), mime: base, seconds: Math.min(secs, MAX_VOICE_SECONDS) }
      cleanup()
      resolver.current?.(clip)
      resolver.current = null
    }
    recorder.current = rec
    startedAt.current = Date.now()
    rec.start(250)
    setState('recording')
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000)
      setSeconds(s)
      if (s >= MAX_VOICE_SECONDS && rec.state === 'recording') rec.stop()
    }, 250)
    return true
  }, [cleanup])

  /** Stops and returns the clip (or null if it was cancelled). */
  const stop = useCallback(
    () =>
      new Promise<VoiceClip | null>((resolve) => {
        if (!recorder.current || recorder.current.state !== 'recording') return resolve(null)
        resolver.current = resolve
        recorder.current.stop()
      }),
    [],
  )

  const cancel = useCallback(() => {
    discard.current = true
    if (recorder.current?.state === 'recording') recorder.current.stop()
    else cleanup()
  }, [cleanup])

  return { state, seconds, error, start, stop, cancel }
}
