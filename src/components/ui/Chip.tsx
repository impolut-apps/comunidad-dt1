import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  emoji?: ReactNode
}

/** Selectable chip (interests, filters). Renders as a toggle button. */
export function Chip({ selected, emoji, children, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-all duration-150 active:scale-95',
        selected
          ? 'border-primary bg-primary text-white shadow-sm shadow-primary/25'
          : 'border-border bg-surface text-text hover:border-electric/60 hover:bg-primary-soft/40',
        className,
      )}
      {...props}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {children}
      {selected && <Check size={14} strokeWidth={3} aria-hidden />}
    </button>
  )
}

/** Static tag (read-only interests on cards). */
export function Tag({ children, emoji, highlight }: { children: ReactNode; emoji?: ReactNode; highlight?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        highlight ? 'bg-primary-soft text-primary-soft-text' : 'bg-surface-muted text-muted',
      )}
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {children}
    </span>
  )
}
