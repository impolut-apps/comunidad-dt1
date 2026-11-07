import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Camera, Delete, Image as ImageIcon, Keyboard, Mic, Paperclip, SendHorizontal, Smile, Sticker, Trash2, X } from 'lucide-react'
import { Button, Modal, Spinner, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { compressImage, MAX_PHOTO_INPUT_BYTES, newFileId, uploadMedia } from '@/lib/media'
import { stickers } from './stickers'
import { emojiCategories, getRecentEmojis, pushRecentEmoji } from './emojis'
import { audioExt, MAX_VOICE_SECONDS, useVoiceRecorder } from './useVoiceRecorder'
import type { Message } from './api'

export const messageSelect =
  'id, conversation_id, sender_id, kind, body, media_path, media_meta, deleted_at, created_at, sender:profiles!messages_sender_id_fkey(display_name, username, avatar_path)'

type NewMessage = Pick<Message, 'kind'> & Partial<Pick<Message, 'body' | 'media_path' | 'media_meta'>>
type Panel = 'none' | 'attach' | 'emoji' | 'stickers'
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * Chat composer with the familiar messenger layout: a pill holding the emoji toggle, text, attach and
 * camera; a round send/mic button beside it; panels (attachments, emoji, stickers) open below it in
 * place of the keyboard.
 */
export function ChatComposer({
  conversationId,
  isGroup,
  onSent,
}: {
  conversationId: string
  isGroup: boolean
  onSent: (m: Message) => void
}) {
  const me = useMe()
  const toast = useToast()
  const navigate = useNavigate()
  const [draft, setDraft] = useState('')
  const [panel, setPanel] = useState<Panel>('none')
  const [sending, setSending] = useState(false)
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [caption, setCaption] = useState('')
  const [recent, setRecent] = useState<string[]>(getRecentEmojis)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const rec = useVoiceRecorder()

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo])
  useEffect(() => {
    if (rec.error) toast(rec.error, 'error')
  }, [rec.error, toast])
  // Grow the textarea with its content (up to max-h).
  useEffect(() => {
    const t = textarea.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${t.scrollHeight}px`
  }, [draft])

  const folder = `chat/${conversationId}/${me.id}`

  async function insert(m: NewMessage) {
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: me.id, ...m })
      .select(messageSelect)
      .single()
    if (error) throw error
    onSent(data as unknown as Message)
  }

  async function run(task: () => Promise<void>) {
    setSending(true)
    try {
      await task()
      return true
    } catch (e) {
      toast(friendlyError(e), 'error')
      return false
    } finally {
      setSending(false)
    }
  }

  async function sendText(e?: FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    if (await run(() => insert({ kind: 'text', body }))) setDraft('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Desktop: Enter sends. Touch keyboards keep Enter as a new line, like messenger apps.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !matchMedia('(pointer: coarse)').matches) {
      e.preventDefault()
      void sendText()
    }
  }

  function insertEmoji(emoji: string) {
    const t = textarea.current
    const start = t?.selectionStart ?? draft.length
    const end = t?.selectionEnd ?? draft.length
    setDraft(draft.slice(0, start) + emoji + draft.slice(end))
    pushRecentEmoji(emoji)
    setRecent(getRecentEmojis())
    requestAnimationFrame(() => t?.setSelectionRange(start + emoji.length, start + emoji.length))
  }

  function backspace() {
    // Remove the last grapheme (emoji-safe).
    const parts = [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(draft)]
    setDraft(parts.slice(0, -1).map((p) => p.segment).join(''))
  }

  function togglePanel(p: Panel) {
    if (panel === p) {
      setPanel('none')
      textarea.current?.focus()
    } else {
      textarea.current?.blur() // hide the phone keyboard; the panel takes its place
      setPanel(p)
    }
  }

  function pickPhoto(file?: File) {
    setPanel('none')
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Ese archivo no es una imagen', 'error')
    if (file.size > MAX_PHOTO_INPUT_BYTES) return toast('La foto es demasiado grande', 'error')
    setCaption(draft)
    setPhoto({ file, url: URL.createObjectURL(file) })
  }

  async function sendPhoto() {
    if (!photo) return
    const ok = await run(async () => {
      const { blob, meta } = await compressImage(photo.file)
      const path = await uploadMedia(`${folder}/${newFileId()}.webp`, blob, 'image/webp')
      await insert({ kind: 'image', media_path: path, media_meta: meta, body: caption.trim() || null })
    })
    if (ok) {
      setPhoto(null)
      setCaption('')
      setDraft('')
    }
  }

  async function sendSticker(code: string) {
    setPanel('none')
    await run(() => insert({ kind: 'sticker', body: code }))
  }

  async function finishRecording() {
    const clip = await rec.stop()
    if (!clip) return
    if (clip.seconds < 1 || clip.blob.size < 1000) return toast('El audio es demasiado corto', 'info')
    await run(async () => {
      const path = await uploadMedia(`${folder}/${newFileId()}.${audioExt(clip.mime)}`, clip.blob, clip.mime)
      await insert({ kind: 'audio', media_path: path, media_meta: { seconds: clip.seconds } })
    })
  }

  const iconBtn = 'flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-text active:scale-95'
  const roundBtn =
    'flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-md shadow-primary/25 transition active:scale-95 disabled:opacity-50'

  return (
    <div className="bg-transparent pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:rounded-b-card">
      {/* Composer row */}
      <div className="flex items-end gap-2 px-2 pt-2">
        {rec.state === 'recording' ? (
          <div className="flex min-h-12 flex-1 items-center gap-2 rounded-[1.6rem] bg-surface px-2 shadow-sm" role="status" aria-live="polite">
            <button onClick={rec.cancel} className={cn(iconBtn, 'text-danger hover:text-danger')} aria-label="Descartar audio">
              <Trash2 size={20} />
            </button>
            <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
            <span className="font-semibold tabular-nums">{mmss(rec.seconds)}</span>
            <span className="truncate text-sm text-muted">Grabando · máx. {mmss(MAX_VOICE_SECONDS)}</span>
          </div>
        ) : (
          <form onSubmit={sendText} className="flex min-h-12 flex-1 items-end rounded-[1.6rem] bg-surface px-1 shadow-sm">
            <button
              type="button"
              onClick={() => togglePanel(panel === 'emoji' || panel === 'stickers' ? panel : 'emoji')}
              className={cn(iconBtn, 'mb-1')}
              aria-label={panel === 'emoji' || panel === 'stickers' ? 'Mostrar teclado' : 'Emojis y stickers'}
            >
              {panel === 'emoji' || panel === 'stickers' ? <Keyboard size={22} /> : <Smile size={22} />}
            </button>
            <textarea
              ref={textarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setPanel('none')}
              rows={1}
              maxLength={2000}
              placeholder="Mensaje"
              aria-label={isGroup ? 'Mensaje para el grupo' : 'Mensaje'}
              className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-1 py-3 text-[16px] leading-snug placeholder:text-muted focus:outline-none"
            />
            <button type="button" onClick={() => togglePanel('attach')} className={cn(iconBtn, 'mb-1', panel === 'attach' && 'text-primary-text')} aria-label="Adjuntar" aria-expanded={panel === 'attach'}>
              <Paperclip size={21} className="-rotate-45" />
            </button>
            {!draft && (
              <button type="button" onClick={() => cameraInput.current?.click()} className={cn(iconBtn, 'mb-1')} aria-label="Cámara">
                <Camera size={22} />
              </button>
            )}
          </form>
        )}

        {rec.state === 'recording' ? (
          <button onClick={finishRecording} className={roundBtn} aria-label="Enviar audio">
            <SendHorizontal size={22} />
          </button>
        ) : draft.trim() ? (
          <button onClick={() => void sendText()} disabled={sending} className={roundBtn} aria-label="Enviar">
            {sending ? <Spinner size={20} /> : <SendHorizontal size={22} />}
          </button>
        ) : (
          <button
            onClick={() => {
              setPanel('none')
              void rec.start()
            }}
            disabled={sending}
            className={roundBtn}
            aria-label="Grabar audio"
          >
            {sending ? <Spinner size={20} /> : <Mic size={22} />}
          </button>
        )}
      </div>

      {/* Panels open below, in place of the keyboard */}
      {panel === 'attach' && (
        <div className="mx-2 mt-2 grid grid-cols-4 gap-y-4 rounded-3xl bg-surface p-4 shadow-sm animate-fade-up">
          <AttachItem label="Galería" color="bg-primary" onClick={() => galleryInput.current?.click()}>
            <ImageIcon size={24} />
          </AttachItem>
          <AttachItem label="Cámara" color="bg-electric" onClick={() => cameraInput.current?.click()}>
            <Camera size={24} />
          </AttachItem>
          <AttachItem label="Sticker" color="bg-mint text-midnight" onClick={() => setPanel('stickers')}>
            <Sticker size={24} />
          </AttachItem>
          <AttachItem label="Crear plan" color="bg-midnight dark:bg-surface-muted" onClick={() => navigate('/plans/new')}>
            <CalendarPlus size={24} />
          </AttachItem>
        </div>
      )}

      {(panel === 'emoji' || panel === 'stickers') && (
        <div className="mx-2 mt-2 overflow-hidden rounded-3xl bg-surface shadow-sm animate-fade-up">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <div className="flex flex-1 justify-center">
              <div className="inline-flex rounded-full bg-surface-muted p-1" role="tablist">
                {(
                  [
                    ['emoji', <Smile key="e" size={18} />, 'Emojis'],
                    ['stickers', <Sticker key="s" size={18} />, 'Stickers'],
                  ] as const
                ).map(([value, icon, label]) => (
                  <button
                    key={value}
                    role="tab"
                    aria-selected={panel === value}
                    aria-label={label}
                    onClick={() => setPanel(value)}
                    className={cn('flex h-8 w-16 items-center justify-center rounded-full transition', panel === value ? 'bg-surface text-primary-text shadow-sm' : 'text-muted')}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            {panel === 'emoji' && (
              <button onClick={backspace} className={iconBtn} aria-label="Borrar">
                <Delete size={20} />
              </button>
            )}
          </div>

          <div className="h-64 overflow-y-auto px-2 pb-3">
            {panel === 'emoji' ? (
              <>
                {recent.length > 0 && <EmojiGrid title="Recientes" emojis={recent} onPick={insertEmoji} />}
                {emojiCategories.map((c) => (
                  <EmojiGrid key={c.id} title={c.label} emojis={c.emojis} onPick={insertEmoji} />
                ))}
              </>
            ) : (
              <div className="grid grid-cols-4 gap-2 pt-3 sm:grid-cols-6">
                {stickers.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => sendSticker(s.code)}
                    disabled={sending}
                    className="flex flex-col items-center gap-1 rounded-2xl p-2 transition hover:bg-surface-muted active:scale-95"
                  >
                    <span className="text-4xl" aria-hidden>
                      {s.emoji}
                    </span>
                    <span className="text-[11px] font-semibold leading-tight text-muted">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (pickPhoto(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => (pickPhoto(e.target.files?.[0]), (e.target.value = ''))} />

      <Modal
        open={photo !== null}
        onClose={() => !sending && setPhoto(null)}
        title="Enviar foto"
        footer={
          <>
            <Button variant="secondary" block icon={<X size={18} />} disabled={sending} onClick={() => setPhoto(null)}>
              Cancelar
            </Button>
            <Button block icon={<SendHorizontal size={18} />} loading={sending} onClick={sendPhoto}>
              Enviar
            </Button>
          </>
        }
      >
        {photo && <img src={photo.url} alt="Vista previa" className="max-h-[50dvh] w-full rounded-2xl bg-surface-muted object-contain" />}
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={2000}
          placeholder="Añade un comentario (opcional)"
          aria-label="Comentario de la foto"
          className="mt-3 h-11 w-full rounded-2xl border border-border bg-bg px-4 text-[15px] focus:border-electric focus:outline-none focus:ring-4 focus:ring-electric/15"
        />
      </Modal>
    </div>
  )
}

function AttachItem({ label, color, onClick, children }: { label: string; color: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 text-sm font-medium text-text">
      <span className={cn('flex size-14 items-center justify-center rounded-full text-white shadow-sm transition active:scale-95', color)}>{children}</span>
      {label}
    </button>
  )
}

function EmojiGrid({ title, emojis, onPick }: { title: string; emojis: string[]; onPick: (e: string) => void }) {
  return (
    <section>
      <h3 className="px-2 pb-1 pt-3 text-xs font-bold text-muted">{title}</h3>
      <div className="grid grid-cols-8 sm:grid-cols-10">
        {emojis.map((e, i) => (
          <button key={`${e}-${i}`} onClick={() => onPick(e)} className="flex aspect-square items-center justify-center rounded-xl text-[26px] transition hover:bg-surface-muted active:scale-90" aria-label={e}>
            {e}
          </button>
        ))}
      </div>
    </section>
  )
}
