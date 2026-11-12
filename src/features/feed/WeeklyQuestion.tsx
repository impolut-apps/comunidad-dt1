import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, MessageCircleHeart } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/** Answers are ordinary posts that start with this marker + the question. */
export const QUESTION_MARK = '💬 '

// Social, everyday questions — never clinical. One per week, rotating.
const questions = [
  '¿Qué plan te apetecería hacer este mes con gente de la Tribu?',
  '¿Qué afición tienes que poca gente conoce?',
  '¿Cuál ha sido tu mejor viaje hasta ahora?',
  '¿Qué deporte te gustaría probar este año?',
  '¿Qué canción no puedes dejar de escuchar últimamente?',
  '¿Qué serie, libro o película recomendarías esta semana?',
  '¿Cuál es tu plan perfecto de domingo?',
  '¿Qué le dirías a alguien que acaba de llegar a la comunidad?',
  '¿Qué sitio de tu ciudad recomendarías para quedar?',
  '¿Qué pequeña victoria has tenido esta semana?',
  '¿Qué te gustaría aprender a hacer?',
  '¿Cuál es tu comida favorita para compartir con amigos?',
]

/** Same question for everyone during a Monday–Sunday week. */
export function currentQuestion(now = new Date()) {
  const firstMonday = new Date(2026, 0, 5) // Monday 5 Jan 2026
  const weeks = Math.floor((now.getTime() - firstMonday.getTime()) / (7 * 86400_000))
  return questions[((weeks % questions.length) + questions.length) % questions.length]
}

interface Answer {
  id: string
  body: string
  author: { display_name: string; avatar_path: string | null } | null
}

export function WeeklyQuestion({ onAnswer }: { onAnswer: (prefill: string) => void }) {
  const question = currentQuestion()
  const [open, setOpen] = useState(false)
  const answers = useQuery({
    queryKey: ['weekly-question', question],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('posts')
        .select('id, body, author:profiles!posts_author_id_fkey(display_name, avatar_path)', { count: 'exact' })
        .ilike('body', `${QUESTION_MARK}${question}%`)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return { list: data as unknown as Answer[], count: count ?? 0 }
    },
  })
  const count = answers.data?.count ?? 0
  const list = answers.data?.list ?? []

  return (
    <section
      className="relative overflow-hidden rounded-card p-5 text-white shadow-card"
      style={{ background: 'linear-gradient(135deg, #142238 0%, #1268D5 70%, #4B91ED 100%)' }}
      aria-label="Pregunta de la semana"
    >
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-mint/30 blur-2xl" aria-hidden />
      <div className="relative">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide">
          <MessageCircleHeart size={14} /> Pregunta de la semana
        </p>
        <h2 className="mt-3 text-xl font-extrabold leading-snug sm:text-2xl">{question}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => onAnswer(`${QUESTION_MARK}${question}\n\n`)}
            className="inline-flex h-11 items-center rounded-2xl bg-white px-5 text-[15px] font-bold text-[#0E4FA3] shadow-sm transition hover:bg-white/90 active:scale-[0.98]"
          >
            Responder
          </button>
          {count > 0 ? (
            <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 text-sm font-semibold text-white/90" aria-expanded={open}>
              <span className="flex -space-x-2">
                {list.slice(0, 3).map((a) => (
                  <Avatar key={a.id} path={a.author?.avatar_path} name={a.author?.display_name} size="xs" className="ring-2 ring-[#1268D5]" />
                ))}
              </span>
              {count} {count === 1 ? 'respuesta' : 'respuestas'}
              <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180')} />
            </button>
          ) : (
            <span className="text-sm text-white/80">Sé la primera persona en responder.</span>
          )}
        </div>
        {open && list.length > 0 && (
          <ul className="mt-4 space-y-2">
            {list.map((a) => (
              <li key={a.id}>
                <Link to={`/posts/${a.id}`} className="block rounded-2xl bg-white/12 p-3 text-sm transition hover:bg-white/20">
                  <span className="font-bold">{a.author?.display_name}: </span>
                  <span className="text-white/90">{a.body.slice(QUESTION_MARK.length + question.length).trim().slice(0, 140) || '…'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
