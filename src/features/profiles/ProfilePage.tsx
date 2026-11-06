import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarHeart, MapPin, Pencil, Settings, UserX } from 'lucide-react'
import { Avatar, Badge, Button, Card, CardSkeleton, EmptyState, ErrorState, Tag } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { countryName } from '@/lib/geo'
import type { Profile } from '@/lib/types'
import { useInterests, useUserInterests } from './shared'
import { ProfileActions } from './ProfileActions'

const joinedFmt = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })

/** /profile (me) and /u/:username (someone else). */
export function ProfilePage() {
  const me = useMe()
  const { username } = useParams()
  const isMe = !username || username === me.username

  const other = useQuery({
    queryKey: ['profile-by-username', username],
    enabled: !isMe,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('username', username!).maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })

  if (!isMe && other.isPending) return <CardSkeleton />
  if (!isMe && other.isError) return <ErrorState message="No hemos podido cargar este perfil." onRetry={() => other.refetch()} />
  const profile = isMe ? me : other.data
  // RLS hides blocked, suspended and unknown profiles alike — we show the same message for all.
  if (!profile)
    return (
      <EmptyState icon={<UserX size={28} />} title="Perfil no disponible" action={<Link to="/discover" className="font-semibold text-primary-text">Descubrir gente</Link>}>
        Puede que el usuario no exista o que no esté disponible.
      </EmptyState>
    )

  return <ProfileView profile={profile} isMe={isMe} />
}

function ProfileView({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const { data: allInterests } = useInterests()
  const { data: ids } = useUserInterests(profile.id)
  const me = useMe()
  const navigate = useNavigate()
  const { data: myIds } = useUserInterests(me.id)
  const interests = allInterests?.filter((i) => ids?.includes(i.id)) ?? []

  return (
    <div className="space-y-4 animate-fade-up">
      {isMe && (
        <div className="flex justify-end gap-2 lg:hidden">
          <Link to="/settings" className="rounded-full p-2.5 text-muted hover:bg-surface-muted" aria-label="Ajustes">
            <Settings size={22} />
          </Link>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="relative h-28 bg-primary sm:h-36">
          <div className="absolute -right-10 -top-16 size-48 rounded-full bg-electric/70 blur-2xl" />
          <div className="absolute -bottom-20 left-10 size-48 rounded-full bg-mint/50 blur-2xl" />
        </div>
        <div className="px-5 pb-6">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <Avatar path={profile.avatar_path} name={profile.display_name} size="xl" className="border-4 border-surface" />
            {isMe && (
              <Button variant="secondary" size="sm" icon={<Pencil size={15} />} onClick={() => navigate('/profile/edit')}>
                Editar perfil
              </Button>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{profile.display_name}</h1>
          <p className="text-[15px] text-muted">@{profile.username}</p>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} /> {profile.city}, {countryName(profile.country)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarHeart size={15} /> Se unió en {joinedFmt.format(new Date(profile.created_at))}
            </span>
            {profile.age_range && <span>{profile.age_range} años</span>}
          </div>

          {profile.bio && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{profile.bio}</p>}
          {!isMe && <ProfileActions profile={profile} />}
        </div>
      </Card>

      {interests.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Intereses</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {interests.map((i) => (
              <Tag key={i.id} emoji={i.emoji} highlight={!isMe && myIds?.includes(i.id)}>
                {i.label_es}
              </Tag>
            ))}
          </div>
        </Card>
      )}

      {(profile.t1d_since || profile.t1d_note) && (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Mi experiencia T1</h2>
            {profile.t1d_since && <Badge tone="mint">Desde {profile.t1d_since}</Badge>}
          </div>
          {profile.t1d_note && <p className="mt-2 text-[15px] leading-relaxed">{profile.t1d_note}</p>}
        </Card>
      )}

      {isMe && !profile.bio && (
        <Card className="border-dashed p-5 text-sm text-muted">
          Los perfiles con una frase sobre ti reciben más conexiones.{' '}
          <Link to="/profile/edit" className="font-semibold text-primary-text">
            Añadir bio
          </Link>
        </Card>
      )}
    </div>
  )
}
