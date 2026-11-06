import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-2xl border border-border bg-surface px-4 text-[15px] text-text placeholder:text-muted/70 ' +
  'transition-colors focus:border-electric focus:outline-none focus:ring-4 focus:ring-electric/15 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15 disabled:opacity-60'

interface FieldShellProps {
  label?: string
  hint?: ReactNode
  error?: string | null
  id: string
  children: ReactNode
  counter?: string
}

function FieldShell({ label, hint, error, id, children, counter }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      {(label || counter) && (
        <div className="flex items-baseline justify-between">
          {label && (
            <label htmlFor={id} className="text-sm font-semibold text-text">
              {label}
            </label>
          )}
          {counter && <span className="text-xs tabular-nums text-muted">{counter}</span>}
        </div>
      )}
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type Common = { label?: string; hint?: ReactNode; error?: string | null }

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common & { leading?: ReactNode }>(
  function Input({ label, hint, error, id, className, leading, ...props }, ref) {
    const auto = useId()
    const fid = id ?? auto
    return (
      <FieldShell label={label} hint={hint} error={error} id={fid}>
        <div className="relative">
          {leading && (
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted">{leading}</span>
          )}
          <input
            ref={ref}
            id={fid}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || hint ? `${fid}-msg` : undefined}
            className={cn(control, 'h-12', Boolean(leading) && 'pl-11', className)}
            {...props}
          />
        </div>
      </FieldShell>
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & Common & { showCount?: boolean }
>(function Textarea({ label, hint, error, id, className, showCount, maxLength, value, ...props }, ref) {
  const auto = useId()
  const fid = id ?? auto
  const counter = showCount && maxLength ? `${String(value ?? '').length}/${maxLength}` : undefined
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} counter={counter}>
      <textarea
        ref={ref}
        id={fid}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
        className={cn(control, 'min-h-24 resize-y py-3 leading-relaxed', className)}
        {...props}
      />
    </FieldShell>
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Common>(function Select(
  { label, hint, error, id, className, children, ...props },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid}>
      <div className="relative">
        <select
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          className={cn(control, 'h-12 appearance-none pr-10', className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      </div>
    </FieldShell>
  )
})

export function Checkbox({
  checked,
  onChange,
  children,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  id?: string
}) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <label htmlFor={fid} className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-text">
      <input
        id={fid}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-md accent-[var(--primary)]"
      />
      <span>{children}</span>
    </label>
  )
}
