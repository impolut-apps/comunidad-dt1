-- =====================================================================
-- Media: photos in posts and chats, voice notes and stickers in chats.
-- Files live in a PRIVATE bucket and are served with short-lived signed URLs.
-- Paths encode who may read them:
--   posts/<author id>/<file>                 → any member
--   chat/<conversation id>/<sender id>/<file> → participants of that conversation
-- Moderators can read everything that can be reported.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 5242880,
  array['image/webp', 'image/jpeg', 'image/png', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safe uuid parse for path segments (a malformed path just denies access).
create or replace function public.try_uuid(t text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

create policy media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and (
      (select public.is_moderator())
      or ((storage.foldername(name))[1] = 'posts' and (select public.is_member()))
      or ((storage.foldername(name))[1] = 'chat'
          and public.is_conversation_participant(public.try_uuid((storage.foldername(name))[2])))
    )
  );

create policy media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (select public.is_member())
    and (
      ((storage.foldername(name))[1] = 'posts' and (storage.foldername(name))[2] = (select auth.uid())::text)
      or ((storage.foldername(name))[1] = 'chat'
          and (storage.foldername(name))[3] = (select auth.uid())::text
          and public.is_conversation_participant(public.try_uuid((storage.foldername(name))[2])))
    )
  );

-- Delete your own uploads only.
create policy media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (
      ((storage.foldername(name))[1] = 'posts' and (storage.foldername(name))[2] = (select auth.uid())::text)
      or ((storage.foldername(name))[1] = 'chat' and (storage.foldername(name))[3] = (select auth.uid())::text)
    )
  );

-- ---------------------------------------------------------------------
-- Messages: text, image (+ optional caption), audio, sticker
-- ---------------------------------------------------------------------
create type public.message_kind as enum ('text', 'image', 'audio', 'sticker');

alter table public.messages
  add column kind       public.message_kind not null default 'text',
  add column media_path text,
  add column media_meta jsonb,
  alter column body drop not null;

alter table public.messages drop constraint messages_body_len;
alter table public.messages
  -- coalesce(..., false): a CHECK that evaluates to NULL would otherwise pass.
  add constraint messages_content check (coalesce(
    case kind
      when 'text'    then media_path is null and char_length(btrim(body)) between 1 and 2000
      when 'image'   then media_path is not null and coalesce(char_length(body), 0) <= 2000
      when 'audio'   then media_path is not null and body is null
      when 'sticker' then media_path is null and body ~ '^[a-z0-9_-]{1,24}$'
    end, false)
  ),
  -- A message may only point at a file uploaded by its sender into this conversation's folder.
  add constraint messages_media_own_folder check (
    media_path is null or media_path like 'chat/' || conversation_id::text || '/' || sender_id::text || '/%'
  ),
  add constraint messages_media_meta_size check (media_meta is null or pg_column_size(media_meta) < 512);

grant insert (kind, media_path, media_meta) on public.messages to authenticated;

-- ---------------------------------------------------------------------
-- Posts: optional photo; text becomes optional when there is one
-- ---------------------------------------------------------------------
alter table public.posts
  add column image_path text,
  add column image_meta jsonb,
  alter column body set default '';

alter table public.posts drop constraint posts_body_len;
alter table public.posts
  add constraint posts_content check (
    char_length(body) <= 2000 and (char_length(btrim(body)) >= 1 or image_path is not null)
  ),
  add constraint posts_image_own_folder check (image_path is null or image_path like 'posts/' || author_id::text || '/%'),
  add constraint posts_image_meta_size check (image_meta is null or pg_column_size(image_meta) < 512);

grant insert (image_path, image_meta) on public.posts to authenticated;

-- ---------------------------------------------------------------------
-- Inbox previews: show "📷 Foto" / "🎤 Audio" / sticker instead of an empty body
-- ---------------------------------------------------------------------
create or replace function public.message_preview(kind public.message_kind, body text)
returns text language sql immutable set search_path = '' as $$
  select case kind
    when 'image' then '📷 ' || coalesce(nullif(btrim(body), ''), 'Foto')
    when 'audio' then '🎤 Audio'
    when 'sticker' then '✨ Sticker'
    else body
  end;
$$;

create or replace function public.my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  last_message_at timestamptz,
  last_message_body text,
  last_message_sender uuid,
  unread_count bigint
) language sql stable security invoker set search_path = '' as $$
  select
    c.id,
    other.user_id,
    c.last_message_at,
    lm.preview,
    lm.sender_id,
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at)
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id and c.kind = 'direct'
  join public.conversation_participants other
    on other.conversation_id = c.id and other.user_id <> me.user_id
  left join lateral (
    select public.message_preview(m.kind, m.body) as preview, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

create or replace function public.list_groups()
returns table (
  id uuid,
  title text,
  description text,
  emoji text,
  member_count bigint,
  joined boolean,
  last_message_at timestamptz,
  last_message_body text,
  last_sender_name text,
  unread_count bigint
) language sql stable security definer set search_path = '' as $$
  select
    c.id, c.title, c.description, c.emoji,
    (select count(*) from public.conversation_participants p where p.conversation_id = c.id),
    me.user_id is not null,
    c.last_message_at,
    case when me.user_id is not null then lm.preview end,
    case when me.user_id is not null then lm.display_name end,
    case when me.user_id is not null then (
      select count(*) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at
        and not public.is_blocked(auth.uid(), m.sender_id)
    ) else 0 end
  from public.conversations c
  left join public.conversation_participants me on me.conversation_id = c.id and me.user_id = auth.uid()
  left join lateral (
    select public.message_preview(m.kind, m.body) as preview, pr.display_name from public.messages m
    join public.profiles pr on pr.id = m.sender_id
    where m.conversation_id = c.id and not public.is_blocked(auth.uid(), m.sender_id)
    order by m.created_at desc limit 1
  ) lm on true
  where c.kind = 'group' and public.is_member()
  order by me.user_id is null, coalesce(c.last_message_at, c.created_at) desc, c.sort_order;
$$;

-- Moderators also need to see/hear reported media.
create or replace function public.report_target_preview(report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.reports%rowtype;
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into r from public.reports where id = report_id;
  return case r.target_type
    when 'user' then (select jsonb_build_object('author_id', id, 'text', coalesce(display_name, '') || ' (@' || coalesce(username, '') || ') ' || coalesce(bio, ''), 'status', status, 'media_path', avatar_path, 'media_bucket', 'avatars', 'kind', 'image') from public.profiles where id = r.target_id)
    when 'post' then (select jsonb_build_object('author_id', author_id, 'text', body, 'status', moderation_status, 'media_path', image_path, 'media_bucket', 'media', 'kind', 'image') from public.posts where id = r.target_id)
    when 'comment' then (select jsonb_build_object('author_id', author_id, 'text', body, 'status', moderation_status) from public.comments where id = r.target_id)
    when 'activity' then (select jsonb_build_object('author_id', organizer_id, 'text', title || ' — ' || coalesce(description, ''), 'status', status) from public.activities where id = r.target_id)
    when 'message' then (select jsonb_build_object('author_id', sender_id, 'text', public.message_preview(kind, body), 'media_path', media_path, 'media_bucket', 'media', 'kind', kind) from public.messages where id = r.target_id)
  end;
end;
$$;

-- Moderators can view reported avatars too (avatars bucket).
create policy avatars_read_moderators on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (select public.is_moderator()));
