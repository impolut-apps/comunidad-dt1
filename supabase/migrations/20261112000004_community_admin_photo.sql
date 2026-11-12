-- =====================================================================
-- Communities: the host is the community's administrator.
--  * Only the administrator writes in "Avisos" (the team no longer can;
--    moderation still works through reports and the moderation panel).
--  * The administrator can set the community photo (moderators too, to help).
-- Additive and backwards compatible.
-- =====================================================================

alter table public.communities
  add column if not exists photo_path text check (char_length(photo_path) <= 200);

create or replace function public.can_post_in(conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.conversations c
    join public.communities co on co.id = c.community_id
    where c.id = conv and c.channel = 'announcements'
      and co.host_id is distinct from auth.uid()
  );
$$;

-- The photo lives in the avatars bucket, inside the uploader's own folder
-- ("<uid>/community-<id>-<file>.webp"), so storage policies stay as they are.
create or replace function public.set_community_photo(p_id uuid, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.communities
    where id = p_id and (host_id = auth.uid() or public.is_moderator())
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_path is not null and p_path !~ ('^' || auth.uid()::text || '/community-[0-9a-f-]+\.webp$') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  update public.communities set photo_path = p_path where id = p_id;
end;
$$;
revoke execute on function public.set_community_photo(uuid, text) from public, anon;
grant execute on function public.set_community_photo(uuid, text) to authenticated;

drop function if exists public.list_communities();
create function public.list_communities()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  emoji text,
  photo_path text,
  host_id uuid,
  host_username text,
  host_name text,
  host_avatar text,
  member_count bigint,
  joined boolean,
  announcements_id uuid,
  chat_id uuid,
  last_announcement_at timestamptz,
  last_announcement_body text,
  last_chat_at timestamptz,
  last_chat_body text,
  last_chat_sender text,
  unread_announcements bigint,
  unread_chat bigint
) language sql stable security definer set search_path = '' as $$
  select
    co.id, co.slug, co.name, co.description, co.emoji, co.photo_path,
    co.host_id, h.username, h.display_name, h.avatar_path,
    (select count(*) from public.conversation_participants p where p.conversation_id = a.id),
    ma.user_id is not null,
    a.id, ch.id,
    la.created_at, la.preview,
    case when mc.user_id is not null then lc.created_at end,
    case when mc.user_id is not null then lc.preview end,
    case when mc.user_id is not null then lc.display_name end,
    case when ma.user_id is not null then (
      select count(*) from public.messages m
      where m.conversation_id = a.id and m.sender_id <> auth.uid() and m.created_at > ma.last_read_at and m.deleted_at is null
    ) else 0 end,
    case when mc.user_id is not null then (
      select count(*) from public.messages m
      where m.conversation_id = ch.id and m.sender_id <> auth.uid() and m.created_at > mc.last_read_at
        and m.deleted_at is null and not public.is_blocked(auth.uid(), m.sender_id)
    ) else 0 end
  from public.communities co
  join public.conversations a on a.community_id = co.id and a.channel = 'announcements'
  join public.conversations ch on ch.community_id = co.id and ch.channel = 'chat'
  left join public.profiles h on h.id = co.host_id
  left join public.conversation_participants ma on ma.conversation_id = a.id and ma.user_id = auth.uid()
  left join public.conversation_participants mc on mc.conversation_id = ch.id and mc.user_id = auth.uid()
  left join lateral (
    select m.created_at, public.message_preview(m.kind, m.body, m.deleted_at) as preview from public.messages m
    where m.conversation_id = a.id and m.deleted_at is null
    order by m.created_at desc limit 1
  ) la on true
  left join lateral (
    select m.created_at, public.message_preview(m.kind, m.body, m.deleted_at) as preview, pr.display_name from public.messages m
    join public.profiles pr on pr.id = m.sender_id
    where m.conversation_id = ch.id and not public.is_blocked(auth.uid(), m.sender_id)
    order by m.created_at desc limit 1
  ) lc on true
  where public.is_member()
  order by ma.user_id is null, greatest(la.created_at, lc.created_at, co.created_at) desc;
$$;
revoke execute on function public.list_communities() from public, anon;
grant execute on function public.list_communities() to authenticated;
