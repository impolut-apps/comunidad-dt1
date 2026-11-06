import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/20',
  secondary: 'bg-surface text-text border border-border hover:bg-surface-muted',
  soft: 'bg-primary-soft text-primary-soft-text hover:brightness-95 dark:hover:brightness-110',
  ghost: 'text-text hover:bg-surface-muted',
  danger: 'bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-110',
}
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-[15px] gap-2 rounded-2xl',
  lg: 'h-13 px-6 text-base gap-2 rounded-2xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, block, icon, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-all duration-150',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={18} /> : icon}
      {children}
    </button>
  )
})
