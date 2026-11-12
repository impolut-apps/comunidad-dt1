import { Link } from 'react-router-dom'
import { Compass, CalendarDays, MessageCircle, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/ui'
import { InstallCard } from '@/components/InstallApp'
import { brand } from '@/lib/brand'
import { PeopleCluster } from './AuthLayout'
import { useSignupMode } from './useSignupMode'

const features = [
  { icon: Compass, title: 'Conoce gente cerca', text: 'Personas con diabetes tipo 1 en tu ciudad y con tus aficiones.' },
  { icon: CalendarDays, title: 'Haz planes', text: 'Pádel el sábado, una ruta, un café… Crea un plan o únete a uno.' },
  { icon: MessageCircle, title: 'Habla con quien te entiende', text: 'Sin tener que explicar nada. Ellos ya lo saben.' },
  { icon: ShieldCheck, title: 'Privado y seguro', text: 'Solo adultos. Ubicación aproximada. Tú decides qué compartes.' },
]

export function LandingPage() {
  const { mode } = useSignupMode()
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <Logo />
        <Link to="/login" className="rounded-2xl px-4 py-2 text-sm font-semibold text-primary-text hover:bg-primary-soft">
          Entrar
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-2 lg:pt-20">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-semibold text-primary-soft-text">
            <span className="size-2 rounded-full bg-mint" /> Para adultos con diabetes tipo 1
          </span>
          <h1 className="mt-5 text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            {brand.slogan}.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
            Nadie debería vivir la diabetes tipo 1 sintiéndose solo. Conoce a gente como tú, cerca de ti, para hacer
            deporte, viajar, tomar algo o simplemente hablar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {mode === 'closed' ? (
              <p className="rounded-2xl bg-primary-soft px-5 py-3.5 text-[15px] font-semibold text-primary-soft-text">
                El registro está cerrado de momento. Vuelve pronto.
              </p>
            ) : (
              <Link
                to="/signup"
                className="inline-flex h-13 items-center justify-center rounded-2xl bg-primary px-7 text-base font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-hover active:scale-[0.98]"
              >
                {mode === 'invite' ? 'Tengo una invitación' : 'Únete gratis'}
              </Link>
            )}
            <Link
              to="/login"
              className="inline-flex h-13 items-center justify-center rounded-2xl border border-border bg-surface px-7 text-base font-semibold hover:bg-surface-muted"
            >
              Ya tengo cuenta
            </Link>
          </div>
          <InstallCard className="mt-6 max-w-lg" />
        </div>
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-[2rem] bg-primary p-10 shadow-2xl shadow-primary/30">
          <div className="absolute -right-16 -top-16 size-64 rounded-full bg-electric/70 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 size-72 rounded-full bg-mint/40 blur-3xl" />
          <PeopleCluster className="relative w-full" />
          <p className="relative mt-8 text-2xl font-bold text-white">Más que una condición en común.</p>
          <p className="relative mt-2 text-white/80">Amistades, planes y gente con tus mismas ganas de vivir.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-card border border-border bg-surface p-5 shadow-card">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-text">
                <Icon size={22} />
              </div>
              <h2 className="mt-4 font-bold">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        <p>
          {brand.name} es una comunidad social, no un servicio médico.{' '}
          <Link to="/legal/privacy" className="hover:underline">
            Privacidad
          </Link>{' '}
          ·{' '}
          <Link to="/legal/terms" className="hover:underline">
            Condiciones
          </Link>{' '}
          ·{' '}
          <Link to="/ayuda" className="hover:underline">
            ¿Necesitas ayuda ahora?
          </Link>
        </p>
      </footer>
    </div>
  )
}
