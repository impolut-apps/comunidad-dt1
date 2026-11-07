import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, MessageCircle, UserRound, X } from 'lucide-react'
import { LogoMark } from '@/components/ui'
import { useMe } from '@/app/auth'
import { brand } from '@/lib/brand'

const KEY = 'welcome-dismissed'
const SHOW_FOR_DAYS = 14

/**
 * A welcome from the team (clearly from the team — not a fake member post), shown to new members
 * during their first two weeks until dismissed. Gives three concrete first steps.
 */
export function WelcomeCard() {
  const me = useMe()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === me.id
    } catch {
      return false
    }
  })
  const isNew = me.onboarded_at && Date.now() - new Date(me.onboarded_at).getTime() < SHOW_FOR_DAYS * 86400_000
  if (dismissed || !isNew) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(KEY, me.id)
    } catch {
      /* ignore */
    }
  }

  const steps = [
    { to: '/profile/edit', icon: UserRound, title: 'Completa tu perfil', text: 'Una foto y una frase sobre ti ayudan a conectar.' },
    { to: '/messages?tab=groups', icon: MessageCircle, title: 'Únete a un grupo', text: 'Preséntate en «Recién llegados».' },
    { to: '/plans', icon: CalendarPlus, title: 'Apúntate a un plan', text: 'O crea uno: un café también cuenta.' },
  ]

  return (
    <section className="relative overflow-hidden rounded-card bg-primary p-5 text-white shadow-card animate-fade-up" aria-label="Bienvenida">
      <div className="absolute -right-12 -top-16 size-48 rounded-full bg-electric/60 blur-2xl" aria-hidden />
      <button onClick={dismiss} className="absolute right-3 top-3 rounded-full p-1.5 text-white/80 hover:bg-white/15" aria-label="Cerrar bienvenida">
        <X size={18} />
      </button>
      <div className="relative">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <LogoMark size={22} /> El equipo de {brand.name}
        </div>
        <h2 className="mt-2 text-xl font-extrabold leading-tight">¡Bienvenida, bienvenido! Aquí nadie tiene que explicar nada.</h2>
        <p className="mt-1 text-[15px] text-white/85">Tres primeros pasos para encontrar a tu gente:</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {steps.map(({ to, icon: Icon, title, text }) => (
            <li key={to}>
              <Link to={to} className="flex h-full gap-3 rounded-2xl bg-white/12 p-3 transition hover:bg-white/20">
                <Icon size={20} className="mt-0.5 shrink-0 text-mint" />
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="block text-sm text-white/80">{text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-white/75">
          Antes de nada, echa un ojo a las{' '}
          <Link to="/legal/normas" className="font-semibold text-white underline underline-offset-2">
            normas de la comunidad
          </Link>
          . Son cortas.
        </p>
      </div>
    </section>
  )
}
