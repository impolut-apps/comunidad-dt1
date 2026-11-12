import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { Spinner, useToast } from '@/components/ui'
import { useMe } from '@/app/auth'
import { supabase } from '@/lib/supabase'
import { compressImage, MAX_PHOTO_INPUT_BYTES, newFileId, useSignedUrl } from '@/lib/media'
import { friendlyError } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { communityCover, type Community } from './api'

const sizes = {
  sm: 'size-10 text-xl rounded-2xl',
  md: 'size-12 text-2xl rounded-2xl',
  lg: 'size-16 text-4xl rounded-3xl',
  xl: 'size-24 text-5xl rounded-[1.75rem]',
}

type Photo = Pick<Community, 'slug' | 'emoji' | 'photo_path' | 'name'>

/** The community's photo, or its emoji on its colour when it has none. */
export function CommunityAvatar({ c, size = 'md', className }: { c: Photo; size?: keyof typeof sizes; className?: string }) {
  const src = useSignedUrl('avatars', c.photo_path)
  return (
    <span
      className={cn('relative flex shrink-0 select-none items-center justify-center overflow-hidden', sizes[size], className)}
      style={src ? undefined : communityCover(c.slug)}
      aria-hidden
    >
      {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : (c.emoji ?? '💙')}
    </span>
  )
}

/** Big avatar on the community page; the admin (host) — or the team — can tap it to change the photo. */
export function EditableCommunityAvatar({ c }: { c: Community }) {
  const me = useMe()
  const toast = useToast()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const canEdit = c.host_id === me.id || Boolean(me.is_moderator)

  async function upload(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('Ese archivo no es una imagen', 'error')
    if (file.size > MAX_PHOTO_INPUT_BYTES) return toast('La foto es demasiado grande', 'error')
    setBusy(true)
    try {
      const { blob } = await compressImage(file, 800)
      const path = `${me.id}/community-${c.id}-${newFileId()}.webp`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/webp' })
      if (upErr) throw upErr
      const { error } = await supabase.rpc('set_community_photo', { p_id: c.id, p_path: path })
      if (error) {
        await supabase.storage.from('avatars').remove([path])
        throw error
      }
      // Tidy up the previous photo when it was ours (others' folders aren't writable anyway).
      if (c.photo_path?.startsWith(`${me.id}/`)) await supabase.storage.from('avatars').remove([c.photo_path])
      await qc.invalidateQueries({ queryKey: ['communities'] })
      toast('Foto de la comunidad actualizada')
    } catch (e) {
      toast(friendlyError(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) return <CommunityAvatar c={c} size="xl" className="shadow-lg ring-4 ring-white/30" />
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={busy}
      className="group relative shrink-0 rounded-[1.75rem] focus-visible:outline-offset-4"
      aria-label="Cambiar la foto de la comunidad"
    >
      <CommunityAvatar c={c} size="xl" className="shadow-lg ring-4 ring-white/30" />
      <span className="absolute -bottom-1 -right-1 flex size-9 items-center justify-center rounded-full border-4 border-white/0 bg-white text-primary-text shadow-md transition group-hover:scale-105">
        {busy ? <Spinner size={16} /> : <Camera size={16} />}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </button>
  )
}
