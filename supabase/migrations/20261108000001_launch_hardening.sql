-- =====================================================================
-- Launch hardening:
--   1. Delete your own messages ("eliminar para todos")
--   2. Anti-spam rate limits enforced in the database
--   3. Plan edits cannot drop capacity below current attendees
--   4. Moderators can pin posts (team announcements)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Deleted messages
-- ---------------------------------------------------------------------
alter table public.messages add column deleted_at timestamptz;

alter table public.messages drop constraint messages_content;
alter table public.messages
  add constraint messages_content check (
    (deleted_at is not null and body is null and media_path is null)
    or coalesce(
      case kind
        when 'text'    then media_path is null and char_length(btrim(body)) between 1 and 2000
        when 'image'   then media_path is not null and coalesce(char_length(body), 0) <= 2000
        when 'audio'   then media_path is not null and body is null
        when 'sticker' then media_path is null and body ~ '^[a-z0-9_-]{1,24}$'
      end, false)
  );

-- If a deleted message had been reported, keep a copy for moderators only (evidence of abuse).
-- Nothing else keeps deleted content. Mentioned in the privacy policy.
create table public.deleted_message_archive (
  message_id      uuid primary key,
  conversation_id uuid not null,
  sender_id       uuid,
  kind            public.message_kind not null,
  body            text,
  media_path      text,
  created_at      timestamptz not null,
  deleted_at      timestamptz not null default now()
);
alter table public.deleted_message_archive enable row level security;
revoke all on public.deleted_message_archive from anon, authenticated;

-- Returns the media path (if any) so the client can remove the file — unless the message
-- was reported, in which case the file is kept for moderation (returns null).
create or replace function public.delete_my_message(message_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  m public.messages%rowtype;
  reported boolean;
begin
  select * into m from public.messages where id = message_id for update;
  if not found or m.sender_id <> auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if m.deleted_at is not null then
    return null;
  end if;
  reported := exists (select 1 from public.reports where target_type = 'message' and target_id = m.id);
  if reported then
    insert into public.deleted_message_archive (message_id, conversation_id, sender_id, kind, body, media_path, created_at)
    values (m.id, m.conversation_id, m.sender_id, m.kind, m.body, m.media_path, m.created_at)
    on conflict do nothing;
  end if;
  update public.messages set deleted_at = now(), body = null, media_path = null, media_meta = null where id = m.id;
  return case when reported then null else m.media_path end;
end;
$$;
revoke execute on function public.delete_my_message(uuid) from public, anon;
grant execute on function public.delete_my_message(uuid) to authenticated;

-- Stream updates (deletions) as well as inserts — messages is already in the publication.

-- Inbox/group previews show deletions.
create or replace function public.message_preview(kind public.message_kind, body text, deleted_at timestamptz)
returns text language sql immutable set search_path = '' as $$
  select case
    when deleted_at is not null then '🚫 Mensaje eliminado'
    else public.message_preview(kind, body)
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
      where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at and m.deleted_at is null)
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id and c.kind = 'direct'
  join public.conversation_participants other
    on other.conversation_id = c.id and other.user_id <> me.user_id
  left join lateral (
    select public.message_preview(m.kind, m.body, m.deleted_at) as preview, m.sender_id from public.messages m
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
        and m.deleted_at is null and not public.is_blocked(auth.uid(), m.sender_id)
    ) else 0 end
  from public.conversations c
  left join public.conversation_participants me on me.conversation_id = c.id and me.user_id = auth.uid()
  left join lateral (
    select public.message_preview(m.kind, m.body, m.deleted_at) as preview, pr.display_name from public.messages m
    join public.profiles pr on pr.id = m.sender_id
    where m.conversation_id = c.id and not public.is_blocked(auth.uid(), m.sender_id)
    order by m.created_at desc limit 1
  ) lm on true
  where c.kind = 'group' and public.is_member()
  order by me.user_id is null, coalesce(c.last_message_at, c.created_at) desc, c.sort_order;
$$;

-- Moderators see the archived copy of a reported message that its sender deleted.
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
    when 'message' then coalesce(
      (select jsonb_build_object('author_id', a.sender_id, 'text', '[Borrado por su autor] ' || public.message_preview(a.kind, a.body), 'media_path', a.media_path, 'media_bucket', 'media', 'kind', a.kind)
        from public.deleted_message_archive a where a.message_id = r.target_id),
      (select jsonb_build_object('author_id', sender_id, 'text', public.message_preview(kind, body, deleted_at), 'media_path', media_path, 'media_bucket', 'media', 'kind', kind)
        from public.messages where id = r.target_id)
    )
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Rate limits (anti-spam). Generous for real people, tight for bots.
-- ---------------------------------------------------------------------
create or replace function public.enforce_rate_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  who uuid;
  n int;
  max_n int;
  win interval;
begin
  case tg_table_name
    when 'messages'      then who := new.sender_id;    max_n := 30; win := interval '1 minute';
      select count(*) into n from public.messages where sender_id = who and created_at > now() - win;
    when 'posts'         then who := new.author_id;    max_n := 5;  win := interval '10 minutes';
      select count(*) into n from public.posts where author_id = who and created_at > now() - win;
    when 'comments'      then who := new.author_id;    max_n := 20; win := interval '10 minutes';
      select count(*) into n from public.comments where author_id = who and created_at > now() - win;
    when 'connections'   then who := new.requester_id; max_n := 30; win := interval '1 hour';
      select count(*) into n from public.connections where requester_id = who and created_at > now() - win;
    when 'activities'    then who := new.organizer_id; max_n := 10; win := interval '1 day';
      select count(*) into n from public.activities where organizer_id = who and created_at > now() - win;
    when 'reports'       then who := new.reporter_id;  max_n := 20; win := interval '1 hour';
      select count(*) into n from public.reports where reporter_id = who and created_at > now() - win;
  end case;
  if n >= max_n then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit before insert on public.messages for each row execute function public.enforce_rate_limit();
create trigger posts_rate_limit before insert on public.posts for each row execute function public.enforce_rate_limit();
create trigger comments_rate_limit before insert on public.comments for each row execute function public.enforce_rate_limit();
create trigger connections_rate_limit before insert on public.connections for each row execute function public.enforce_rate_limit();
create trigger activities_rate_limit before insert on public.activities for each row execute function public.enforce_rate_limit();
create trigger reports_rate_limit before insert on public.reports for each row execute function public.enforce_rate_limit();

create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index if not exists connections_requester_created_idx on public.connections (requester_id, created_at desc);
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. Editing plans: capacity can't go below who's already going
-- ---------------------------------------------------------------------
create or replace function public.validate_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.starts_at <= now() then
    raise exception 'activity_in_past' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.starts_at is distinct from old.starts_at and new.starts_at <= now() then
      raise exception 'activity_in_past' using errcode = 'P0001';
    end if;
    if new.max_participants is not null and new.max_participants is distinct from old.max_participants
       and new.max_participants < (select count(*) from public.activity_participants where activity_id = new.id) then
      raise exception 'activity_capacity_below_attendees' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Pinned posts (team announcements at the top of the feed)
-- ---------------------------------------------------------------------
alter table public.posts add column pinned_at timestamptz;
create index posts_pinned_idx on public.posts (pinned_at desc) where pinned_at is not null;

create or replace function public.set_post_pinned(post_id uuid, pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.posts set pinned_at = case when pinned then now() end where id = post_id;
end;
$$;
revoke execute on function public.set_post_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_post_pinned(uuid, boolean) to authenticated;
