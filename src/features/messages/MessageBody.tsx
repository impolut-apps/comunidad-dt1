import type { ReactNode } from 'react'
import { Ban, Check, CheckCheck } from 'lucide-react'
import { StoredImage, VoiceNote } from '@/components/ui'
import { cn } from '@/lib/cn'
import { stickerByCode } from './stickers'
import type { Message } from './api'

export type Receipt = 'sent' | 'read' | null

/**
 * One message, rendered by kind: text bubble, photo (+caption), voice note or sticker.
 * The first bubble of a run gets a "tail"; time and ✓/✓✓ sit inside the bubble, bottom-right.
 */
export function MessageBody({
  message: m,
  mine,
  time,
  tail,
  receipt,
  avatar,
  onToggleMenu,
}: {
  message: Message
  mine: boolean
  time: string
  tail: boolean
  receipt: Receipt
  avatar?: ReactNode
  onToggleMenu: () => void
}) {
  // Time + ticks. 'bubble': inside a coloured bubble (white text for mine); 'media': pill over a photo;
  // 'light': on a light surface even for my own message (stickers) — white text there would be invisible.
  const meta = (surface: 'bubble' | 'media' | 'light' = 'bubble') => {
    const onWhite = mine && surface === 'bubble'
    return (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 whitespace-nowrap align-bottom text-[11px]',
          surface !== 'light' && 'ml-2 translate-y-1',
          surface === 'media' ? 'rounded-full bg-midnight/45 px-1.5 py-0.5 text-white' : onWhite ? 'text-white/75' : 'text-muted',
        )}
      >
        {time}
        {receipt === 'read' ? (
          <CheckCheck size={15} className={surface === 'media' || onWhite ? 'text-mint' : 'text-primary-text'} aria-label="Leído" />
        ) : receipt === 'sent' ? (
          <Check size={15} aria-label="Enviado" />
        ) : null}
      </span>
    )
  }

  if (m.deleted_at) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-[14px] italic shadow-sm',
          mine ? 'bg-primary/80 text-white/85' : 'bg-surface text-muted',
        )}
      >
        <Ban size={14} aria-hidden /> {mine ? 'Eliminaste este mensaje' : 'Mensaje eliminado'}
        <span className={cn('ml-1 text-[11px] not-italic', mine ? 'text-white/70' : 'text-muted')}>{time}</span>
      </span>
    )
  }

  if (m.kind === 'sticker') {
    const s = m.body ? stickerByCode.get(m.body) : undefined
    return (
      <button type="button" onClick={onToggleMenu} className="flex cursor-default flex-col items-center px-1 py-1" aria-label={`Sticker: ${s?.label ?? m.body}`}>
        <span className="text-7xl leading-none drop-shadow-md" aria-hidden>
          {s?.emoji ?? '✨'}
        </span>
        <span className="mt-1.5 rounded-full bg-surface px-3 py-1 text-xs font-bold text-primary-text shadow-sm">{s?.label ?? m.body}</span>
        <span className="mt-1 rounded-full bg-surface/80 px-2 py-0.5">{meta('light')}</span>
      </button>
    )
  }

  const bubble = cn(
    'relative text-left text-[15px] leading-relaxed shadow-sm',
    mine ? 'bg-primary text-white' : 'bg-surface text-text',
    'rounded-2xl',
    tail && (mine ? 'rounded-tr-md' : 'rounded-tl-md'),
  )
  const tailEl = tail && (
    <svg
      viewBox="0 0 8 13"
      className={cn('absolute top-0 h-[13px] w-2', mine ? '-right-2 text-primary' : '-left-2 -scale-x-100 text-surface')}
      aria-hidden
    >
      <path d="M0 0h8L1.5 9.5C.9 10.4 0 10 0 9V0z" fill="currentColor" />
    </svg>
  )

  if (m.kind === 'image' && m.media_path) {
    const hasCaption = Boolean(m.body?.trim())
    return (
      <div className={cn(bubble, 'w-72 max-w-full p-1')}>
        {tailEl}
        <div className="relative overflow-hidden rounded-xl">
          <StoredImage path={m.media_path} meta={m.media_meta as { w: number; h: number } | null} alt={m.body || 'Foto'} />
          {!hasCaption && <span className="pointer-events-none absolute bottom-1.5 right-1.5">{meta('media')}</span>}
        </div>
        {hasCaption && (
          <button type="button" onClick={onToggleMenu} className="block w-full cursor-default whitespace-pre-wrap break-words px-2 pb-1 pt-1.5 text-left">
            {m.body}
            {meta()}
          </button>
        )}
      </div>
    )
  }

  if (m.kind === 'audio' && m.media_path) {
    return (
      <div className={cn(bubble, 'flex items-center gap-2 py-2 pl-2 pr-3')} onClick={onToggleMenu}>
        {tailEl}
        {avatar}
        <div>
          <VoiceNote path={m.media_path} duration={m.media_meta?.seconds} mine={mine} />
          <div className="-mt-4 text-right">{meta()}</div>
        </div>
      </div>
    )
  }

  return (
    <button type="button" onClick={onToggleMenu} className={cn(bubble, 'cursor-default whitespace-pre-wrap break-words px-3 py-1.5')}>
      {tailEl}
      {m.body}
      {meta()}
    </button>
  )
}
