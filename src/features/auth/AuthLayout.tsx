import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui'
import { brand } from '@/lib/brand'

/** Form on the left, warm brand panel on the right (desktop only). */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10">
        <Link to="/" className="self-start">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10 animate-fade-up">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <BrandPanel />
    </div>
  )
}

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-primary lg:block">
      <div className="absolute -right-24 -top-24 size-96 rounded-full bg-electric/60 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 size-[28rem] rounded-full bg-mint/40 blur-3xl" />
      <div className="relative flex h-full flex-col justify-end p-14 text-white">
        <PeopleCluster />
        <p className="mt-10 text-4xl font-extrabold leading-tight tracking-tight">{brand.slogan}.</p>
        <p className="mt-3 max-w-md text-lg text-white/80">
          Gente que vive con diabetes tipo 1, cerca de ti, con tus mismos planes y aficiones.
        </p>
      </div>
    </div>
  )
}

/** Abstract "group of people" illustration — friendly, never medical. */
export function PeopleCluster({ className }: { className?: string }) {
  const people = [
    { x: 40, y: 70, r: 26, c: '#FFFFFF' },
    { x: 110, y: 50, r: 32, c: '#8ADCC3' },
    { x: 185, y: 78, r: 24, c: '#DCEBFF' },
    { x: 245, y: 46, r: 28, c: '#FFFFFF' },
  ]
  return (
    <svg viewBox="0 0 290 170" className={className ?? 'w-80'} aria-hidden>
      {people.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={p.r * 0.55} fill={p.c} />
          <path
            d={`M${p.x - p.r} ${p.y + p.r * 2.6} a${p.r} ${p.r} 0 0 1 ${p.r * 2} 0`}
            fill="none"
            stroke={p.c}
            strokeWidth={p.r * 0.42}
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  )
}
