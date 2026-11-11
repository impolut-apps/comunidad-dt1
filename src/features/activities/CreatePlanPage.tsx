import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button, Card, CardSkeleton, Chip, ErrorState, Input, StickyActions, Textarea, useToast } from '@/components/ui'
import { activitySelect, participantCount, type Activity } from './api'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { LocationFields, useInterests } from '@/features/profiles/shared'

/** "YYYY-MM-DDTHH:mm" in local time, as <input type="datetime-local"> expects. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const suggestions = ['¿Pádel este sábado?', 'Café para conocernos', 'Ruta de senderismo', 'Ver el partido juntos']

export function CreatePlanPage() {
  return <PlanForm />
}

/** /plans/:id/edit — organizer only (RLS enforces it; this redirects everyone else). */
export function EditPlanPage() {
  const { id } = useParams()
  const me = useMe()
  const plan = useQuery({
    queryKey: ['activity', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select(activitySelect).eq('id', id!).maybeSingle()
      if (error) throw error
      return data as unknown as Activity | null
    },
  })
  if (plan.isPending) return <CardSkeleton />
  if (plan.isError) return <ErrorState message="No hemos podido cargar el plan." onRetry={() => plan.refetch()} />
  if (!plan.data || plan.data.organizer_id !== me.id || plan.data.status !== 'open') return <Navigate to={`/plans/${id}`} replace />
  return <PlanForm initial={plan.data} />
}

function PlanForm({ initial }: { initial?: Activity }) {
  const me = useMe()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: interests } = useInterests()
  const editing = Boolean(initial)

  const [title, setTitle] = useState(initial?.title ?? '')
  const [interestId, setInterestId] = useState<number | null>(initial?.interest_id ?? null)
  const [description, setDescription] = useState(initial?.description ?? '')
  const [startsAt, setStartsAt] = useState(initial ? toLocalInput(new Date(initial.starts_at)) : '')
  const [country, setCountry] = useState(initial?.country ?? me.country ?? 'ES')
  const [city, setCity] = useState(initial?.city ?? me.city ?? '')
  const [area, setArea] = useState(initial?.area_hint ?? '')
  const [max, setMax] = useState(initial?.max_participants ? String(initial.max_participants) : '')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const start = startsAt ? new Date(startsAt) : null
  const attendees = initial ? participantCount(initial) : 0
  const errors = {
    title: title.trim().length < 3 ? 'Ponle un título (mínimo 3 caracteres).' : null,
    startsAt: !start ? 'Elige fecha y hora.' : start <= new Date() ? 'Tiene que ser en el futuro.' : null,
    city: !city.trim() ? 'Indica la ciudad.' : null,
    max:
      max && (Number(max) < 2 || Number(max) > 100)
        ? 'Entre 2 y 100 personas.'
        : max && Number(max) < attendees
          ? `Ya hay ${attendees} personas apuntadas.`
          : null,
  }
  const valid = !Object.values(errors).some(Boolean)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    setSaving(true)
    const fields = {
      title: title.trim(),
      interest_id: interestId,
      description: description.trim() || null,
      starts_at: start!.toISOString(),
      country,
      city: city.trim(),
      area_hint: area.trim() || null,
      max_participants: max ? Number(max) : null,
    }
    const { data, error } = initial
      ? await supabase.from('activities').update(fields).eq('id', initial.id).select('id').single()
      : await supabase.from('activities').insert({ organizer_id: me.id, ...fields }).select('id').single()
    setSaving(false)
    if (error) return toast(friendlyError(error), 'error')
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['activities'] }),
      qc.invalidateQueries({ queryKey: ['activity', data.id] }),
      qc.invalidateQueries({ queryKey: ['my-activity-ids'] }),
    ])
    toast(editing ? 'Plan actualizado' : '¡Plan creado! Ya puede apuntarse la gente.')
    navigate(`/plans/${data.id}`, { replace: true })
  }

  const show = (k: keyof typeof errors) => (touched ? errors[k] : null)

  return (
    <form onSubmit={onSubmit} className="space-y-5 animate-fade-up" noValidate>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate(-1)} className="-ml-2 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-extrabold tracking-tight">{editing ? 'Editar plan' : 'Crear plan'}</h1>
      </div>

      <Card className="space-y-5 p-5">
        <div className="space-y-2">
          <Input
            label="¿Qué propones?"
            placeholder="Ej. Pádel el sábado por la mañana"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={show('title')}
          />
          {!title && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTitle(s)}
                  className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-muted hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Categoría</p>
          <div className="flex flex-wrap gap-2">
            {interests?.map((i) => (
              <Chip
                key={i.id}
                emoji={i.emoji}
                selected={interestId === i.id}
                className="h-9"
                onClick={() => setInterestId(interestId === i.id ? null : i.id)}
              >
                {i.label_es}
              </Chip>
            ))}
          </div>
        </div>
        <Textarea
          label="Detalles (opcional)"
          placeholder="Nivel, qué traer, cómo será el plan…"
          maxLength={1000}
          showCount
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Card>

      <Card className="space-y-5 p-5">
        <Input
          label="Fecha y hora"
          type="datetime-local"
          min={toLocalInput(new Date())}
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          error={show('startsAt')}
        />
        <LocationFields country={country} city={city} onCountry={setCountry} onCity={setCity} errors={{ city: show('city') }} />
        <Input
          label="Zona aproximada (opcional)"
          placeholder="Ej. Barrio de Salamanca, Retiro…"
          maxLength={80}
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
        <Input
          label="Máximo de personas (opcional)"
          type="number"
          inputMode="numeric"
          min={2}
          max={100}
          placeholder="Sin límite"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          error={show('max')}
        />
        <p className="flex gap-2 rounded-2xl bg-mint-soft p-3 text-sm text-mint-text">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          No pongas la dirección exacta. Concreta el sitio por mensaje con quien se apunte.
        </p>
      </Card>

      <StickyActions>
        <Button type="submit" block size="lg" loading={saving}>
          {editing ? 'Guardar cambios' : 'Publicar plan'}
        </Button>
      </StickyActions>
    </form>
  )
}
