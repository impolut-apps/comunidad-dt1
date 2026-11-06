import { brand } from '@/lib/brand'
import { cn } from '@/lib/cn'

export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill="#1268D5" />
      <circle cx="24" cy="26" r="8" fill="#fff" />
      <circle cx="41" cy="26" r="8" fill="#8ADCC3" />
      <path
        d="M12 48c0-7 5.5-12 12-12s12 5 12 12M29 48c0-7 5.5-12 12-12s12 5 12 12"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight text-text">{brand.name}</span>
    </span>
  )
}
