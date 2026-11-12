import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CalendarPlus, Plus } from 'lucide-react'
import { Button, CardSkeleton, Chip, EmptyState, ErrorState, PageHeader } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { countryName } from '@/lib/geo'
import { cn } from '@/lib/cn'
import { useInterests } from '@/features/profiles/shared'
import { ActivityCard } from './ActivityCard'
import { activitySelect, useMyActivityIds, type Activity } from './api'

type Tab = 'city' | 'country' | 'mine'

export function PlansPage() {
  const me = useMe()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('city')
  const [category, setCategory] = useState<number | null>(null)
  const { data: interests } = useInterests()
  const myIds = useMyActivityIds(me.id)

  const plans = useQuery({
    queryKey: ['activities', tab, category, tab === 'mine' ? [...(myIds.data ?? [])] : null],
    enabled: tab !== 'mine' || myIds.isSuccess,
    queryFn: async () => {
      let q = supabase.from('activities').select(activitySelect).order('starts_at').limit(50)
      if (tab === 'mine') {
        const ids = [...(myIds.data ?? [])]
        if (!ids.length) return [] as Activity[]
        // Mine: upcoming first, include cancelled so people notice.
        q = q.in('id', ids).gt('starts_at', new Date(Date.now() - 6 * 3600_000).toISOString())
      } else {
        q = q.eq('status', 'open').gt('starts_at', new Date().toISOString()).eq('country', me.country!)
        if (tab === 'city') q = q.eq('city_key', me.city!.trim().toLowerCase())
      }
      if (category) q = q.eq('interest_id', category)
      const { data, error } = await q
      if (error) throw error
      return data as unknown as Activity[]
    },
  })

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'city', label: `En ${me.city}` },
    { value: 'country', label: `En ${countryName(me.country)}` },
    { value: 'mine', label: 'Mis planes' },
  ]

  return (
    <div>
      <PageHeader
        title="Planes"
        subtitle="Quedadas con gente que te entiende"
        action={
          // Mobile uses the floating button below; wrapped because Button already sets `inline-flex`.
          <span className="hidden sm:block">
            <Button icon={<Plus size={18} />} onClick={() => navigate('/plans/new')}>
              Crear plan
            </Button>
          </span>
        }
      />

      <div className="flex gap-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'h-9 truncate rounded-full px-3.5 text-sm font-semibold transition-colors',
              tab === t.value ? 'bg-primary text-white' : 'bg-surface-muted text-muted hover:text-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6" aria-label="Categoría">
        {interests?.map((i) => (
          <Chip
            key={i.id}
            emoji={i.emoji}
            selected={category === i.id}
            className="h-9 shrink-0"
            onClick={() => setCategory(category === i.id ? null : i.id)}
          >
            {i.label_es}
          </Chip>
        ))}
      </div>

      <div className="mt-5">
        {plans.isPending ? (
          <div className="space-y-3">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : plans.isError ? (
          <ErrorState message="No hemos podido cargar los planes." onRetry={() => plans.refetch()} />
        ) : plans.data.length === 0 ? (
          <EmptyState
            icon={tab === 'mine' ? <CalendarDays size={28} /> : <CalendarPlus size={28} />}
            title={tab === 'mine' ? 'Aún no te has apuntado a ningún plan' : 'No hay planes por aquí todavía'}
            action={<Button icon={<Plus size={18} />} onClick={() => navigate('/plans/new')}>Crear el primero</Button>}
          >
            {tab === 'mine'
              ? 'Apúntate a un plan o crea el tuyo. Un café, una ruta, un partido…'
              : '¿Un pádel el sábado? ¿Un café para conocerse? Propón algo y deja que la gente se apunte.'}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {plans.data.map((a) => (
              <li key={a.id}>
                <ActivityCard activity={a} going={myIds.data?.has(a.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Floating action on mobile */}
      <button
        onClick={() => navigate('/plans/new')}
        className="fixed bottom-24 right-5 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition active:scale-95 sm:hidden"
        aria-label="Crear plan"
      >
        <Plus size={26} />
      </button>
    </div>
  )
}
