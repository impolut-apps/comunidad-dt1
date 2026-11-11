import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-border bg-surface shadow-card', className)} {...props} />
}

type Tone = 'blue' | 'mint' | 'neutral' | 'danger'
const tones: Record<Tone, string> = {
  blue: 'bg-primary-soft text-primary-soft-text',
  mint: 'bg-mint-soft text-mint-text',
  neutral: 'bg-surface-muted text-muted',
  danger: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  )
}

/** Small numeric dot for unread counts. */
export function CountDot({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold tabular-nums text-white',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center animate-fade-up', className)}>
      {icon && (
        <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-primary-soft text-primary-soft-text">{icon}</div>
      )}
      <h3 className="text-lg font-bold text-text">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-muted', className)} aria-hidden />
}

export function CardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-card border border-danger/30 bg-danger-soft p-4 text-sm text-danger" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
          Reintentar
        </button>
      )}
    </div>
  )
}

/**
 * Primary action bar that stays visible at the bottom of a long form. It fades the content behind it
 * (so the button never overlaps readable text) and sits above the mobile bottom navigation.
 */
export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 px-4 pb-3 pt-10 sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:px-0"
      style={{ background: 'linear-gradient(to top, var(--bg) 62%, transparent)' }}
    >
      {children}
    </div>
  )
}

/** Consistent page header for top-level sections. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}
