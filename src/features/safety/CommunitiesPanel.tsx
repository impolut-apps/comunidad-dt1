import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, Card, CardSkeleton, ErrorState, Input, Modal, Textarea, useToast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { communityCover, useCommunities, type Community } from '@/features/communities/api'

/** "La tribu de Carlos" → "la-tribu-de-carlos" */
function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

/** Moderators: creator communities (create, edit, delete). */
export function CommunitiesPanel() {
  const communities = useCommunities()
  const [editing, setEditing] = useState<Community | 'new' | null>(null)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Comunidades de creadores</h2>
          <p className="mt-1 text-sm text-muted">
            Cada una tiene Avisos (solo publica el anfitrión) y una Charla. Vincúlala a un código para que sus seguidores entren directos.
          </p>
        </div>
        <Button size="sm" icon={<Plus size={16} />} onClick={() => setEditing('new')}>
          Nueva
        </Button>
      </div>
      {communities.isPending ? (
        <CardSkeleton />
      ) : communities.isError ? (
        <ErrorState message="No hemos podido cargar las comunidades." onRetry={() => communities.refetch()} />
      ) : communities.data.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Todavía no hay comunidades.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {communities.data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-xl" style={communityCover(c.slug)} aria-hidden>
                {c.emoji ?? '💙'}
              </span>
              <Link to={`/c/${c.slug}`} className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.name}</p>
                <p className="truncate text-xs text-muted">
                  /c/{c.slug} · {c.host_name ? `Anfitrión: ${c.host_name}` : 'Sin anfitrión'} · {c.member_count} miembros
                </p>
              </Link>
              <Button size="sm" variant="ghost" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}>
                <Pencil size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <CommunityEditor key={editing === 'new' ? 'new' : editing.id} community={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function CommunityEditor({ community, onClose }: { community: Community | null; onClose: () => void }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState(community?.name ?? '')
  const [slug, setSlug] = useState(community?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(community))
  const [emoji, setEmoji] = useState(community?.emoji ?? '')
  const [description, setDescription] = useState(community?.description ?? '')
  const [host, setHost] = useState(community?.host_username ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const done = (message: string) => {
    void qc.invalidateQueries({ queryKey: ['communities'] })
    void qc.invalidateQueries({ queryKey: ['invite-codes'] })
    toast(message)
    onClose()
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_community', {
        p_id: community?.id ?? null,
        p_slug: slug,
        p_name: name,
        p_description: description.trim() || null,
        p_emoji: emoji.trim() || null,
        p_host_username: host.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => done(community ? 'Comunidad actualizada' : 'Comunidad creada'),
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_community', { p_id: community!.id })
      if (error) throw error
    },
    onSuccess: () => done('Comunidad eliminada'),
    onError: (e) => toast(friendlyError(e), 'error'),
  })

  if (confirmDelete && community)
    return (
      <Modal
        open
        onClose={() => setConfirmDelete(false)}
        title={`¿Eliminar ${community.name}?`}
        footer={
          <>
            <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>
              Volver
            </Button>
            <Button variant="danger" block loading={remove.isPending} onClick={() => remove.mutate()}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-muted">
          Se borrarán sus avisos y toda la charla, y sus {community.member_count} miembros dejarán de estar dentro. Los códigos
          vinculados seguirán funcionando, pero sin comunidad. <strong className="text-text">No se puede deshacer.</strong>
        </p>
      </Modal>
    )

  return (
    <Modal
      open
      onClose={onClose}
      title={community ? `Editar ${community.name}` : 'Nueva comunidad'}
      footer={
        <>
          {community && <Button variant="danger" icon={<Trash2 size={17} />} onClick={() => setConfirmDelete(true)} aria-label="Eliminar comunidad" />}
          <Button variant="secondary" block onClick={onClose}>
            Cancelar
          </Button>
          <Button block loading={save.isPending} disabled={name.trim().length < 3 || slug.length < 3} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[4.5rem_1fr] gap-3">
          <Input label="Emoji" placeholder="🔥" maxLength={8} value={emoji} onChange={(e) => setEmoji(e.target.value)} className="text-center text-xl" />
          <Input
            label="Nombre"
            placeholder="La tribu de Carlos"
            maxLength={60}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugTouched) setSlug(slugify(e.target.value))
            }}
          />
        </div>
        <Input
          label="Enlace"
          leading={<span className="text-sm">/c/</span>}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30))
          }}
          hint="Letras, números y guiones. Si lo cambias, el enlace antiguo deja de funcionar."
        />
        <Input
          label="Anfitrión (usuario)"
          placeholder="@carlos"
          leading={<span className="text-sm">@</span>}
          value={host}
          onChange={(e) => setHost(e.target.value.replace(/^@/, ''))}
          hint="Tiene que tener cuenta en la app. Es quien publica en Avisos."
        />
        <Textarea label="Descripción" rows={3} maxLength={300} showCount value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  )
}
