-- =====================================================================
-- Creator communities ("la comunidad de Carlos")
-- Like a WhatsApp community / Telegram channel: each community has a host
-- (a creator with an account here) and two channels:
--   * announcements — only the host and moderators post; members read.
--   * chat          — every member talks.
-- Open to any member; people who sign up with a code linked to a community
-- join it automatically. Moderators create and edit communities.
-- Additive: existing groups, chats and the current production app are unchanged.
-- =====================================================================

create table public.communities (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,30}$'),
  name        text not null check (char_length(btrim(name)) between 3 and 60),
  description text check (char_length(description) <= 300),
  emoji       text check (char_length(emoji) <= 16),
  host_id     uuid references public.profiles (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.communities enable row level security;
revoke all on public.communities from anon, authenticated;
grant select on public.communities to authenticated;
create policy communities_select on public.communities for select to authenticated
  using ((select public.is_member()));

-- A community's two channels are ordinary group conversations tagged with it.
alter table public.conversations
  add column community_id uuid references public.communities (id) on delete cascade,
  add column channel text check (channel in ('announcements', 'chat')),
  add constraint conversations_channel_fields check ((community_id is null) = (channel is null)),
  add constraint conversations_channel_kind check (community_id is null or kind = 'group');
create unique index conversations_community_channel_idx on public.conversations (community_id, channel) where community_id is not null;

-- The code someone signs up with can drop them into a community.
alter table public.invite_codes add column community_id uuid references public.communities (id) on delete set null;

-- ---------------------------------------------------------------------
-- Who may post: in an announcements channel, only the host and moderators.
-- A restrictive policy, so it adds to (never loosens) the existing rules.
-- ---------------------------------------------------------------------
create or replace function public.can_post_in(conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.conversations c
    join public.communities co on co.id = c.community_id
    where c.id = conv and c.channel = 'announcements'
      and co.host_id is distinct from auth.uid()
  ) or public.is_moderator();
$$;
create policy messages_insert_announcements on public.messages as restrictive for insert to authenticated
  with check (public.can_post_in(conversation_id));

-- Joining a community = joining both channels. Members join/leave it as a unit.
create or replace function public.join_community(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.communities where id = p_community) then
    raise exception 'community_not_found' using errcode = 'P0002';
  end if;
  insert into public.conversation_participants (conversation_id, user_id)
  select c.id, auth.uid() from public.conversations c where c.community_id = p_community
  on conflict do nothing;
end;
$$;

create or replace function public.leave_community(p_community uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.communities where id = p_community and host_id = auth.uid()) then
    raise exception 'host_cannot_leave' using errcode = 'P0001';
  end if;
  delete from public.conversation_participants cp
  using public.conversations c
  where c.id = cp.conversation_id and c.community_id = p_community and cp.user_id = auth.uid();
end;
$$;

-- Directory + my communities. The latest announcement is public to all members
-- (it is a broadcast); the chat stays private to people inside.
create or replace function public.list_communities()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  emoji text,
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
    co.id, co.slug, co.name, co.description, co.emoji,
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

-- ---------------------------------------------------------------------
-- Moderators manage communities
-- ---------------------------------------------------------------------
create or replace function public.save_community(
  p_id uuid, p_slug text, p_name text, p_description text, p_emoji text, p_host_username text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_host uuid;
  v_id uuid := p_id;
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_slug !~ '^[a-z0-9-]{3,30}$' or char_length(btrim(coalesce(p_name, ''))) not between 3 and 60 then
    raise exception 'invalid_community' using errcode = 'P0001';
  end if;
  if nullif(btrim(p_host_username), '') is not null then
    select id into v_host from public.profiles
    where lower(username) = lower(btrim(ltrim(btrim(p_host_username), '@'))) and status = 'active';
    if v_host is null then
      raise exception 'host_not_found' using errcode = 'P0002';
    end if;
  end if;

  begin
    if v_id is null then
      insert into public.communities (slug, name, description, emoji, host_id, created_by)
      values (v_slug, btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_emoji), ''), v_host, auth.uid())
      returning id into v_id;
      insert into public.conversations (kind, title, community_id, channel) values
        ('group', 'Avisos', v_id, 'announcements'),
        ('group', 'Charla', v_id, 'chat');
    else
      update public.communities set
        slug = v_slug, name = btrim(p_name), description = nullif(btrim(p_description), ''),
        emoji = nullif(btrim(p_emoji), ''), host_id = v_host
      where id = v_id;
      if not found then
        raise exception 'community_not_found' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'slug_taken' using errcode = 'P0001';
  end;

  -- The host is always inside their own community.
  if v_host is not null then
    insert into public.conversation_participants (conversation_id, user_id)
    select c.id, v_host from public.conversations c where c.community_id = v_id
    on conflict do nothing;
  end if;
  return v_slug;
end;
$$;

-- Deletes the community with its channels and messages (codes stay, unlinked).
create or replace function public.delete_community(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.communities where id = p_id;
  if not found then
    raise exception 'community_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.join_community(uuid) from public, anon;
revoke execute on function public.leave_community(uuid) from public, anon;
revoke execute on function public.list_communities() from public, anon;
revoke execute on function public.save_community(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.delete_community(uuid) from public, anon;
grant execute on function public.join_community(uuid) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.list_communities() to authenticated;
grant execute on function public.save_community(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.delete_community(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Topic groups list must not show community channels.
-- ---------------------------------------------------------------------
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
  where c.kind = 'group' and c.community_id is null and public.is_member()
  order by me.user_id is null, coalesce(c.last_message_at, c.created_at) desc, c.sort_order;
$$;

-- ---------------------------------------------------------------------
-- Codes can point at a community
-- ---------------------------------------------------------------------
drop function if exists public.create_invite_code(text, int, text, int);
create function public.create_invite_code(p_code text, p_max_uses int default 1000000, p_note text default null, p_days int default null, p_community uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z0-9-]{3,24}$' or p_max_uses is null or p_max_uses not between 1 and 1000000
     or (p_days is not null and p_days < 1) then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  begin
    insert into public.invite_codes (code, note, max_uses, expires_at, created_by, community_id)
    values (v_code, nullif(btrim(p_note), ''), p_max_uses,
            case when p_days is not null then now() + make_interval(days => p_days) end, auth.uid(), p_community);
  exception when unique_violation then
    raise exception 'code_taken' using errcode = 'P0001';
  end;
  return v_code;
end;
$$;
revoke execute on function public.create_invite_code(text, int, text, int, uuid) from public, anon;
grant execute on function public.create_invite_code(text, int, text, int, uuid) to authenticated;

drop function if exists public.update_invite_code(text, int, text, timestamptz, boolean);
create function public.update_invite_code(p_code text, p_max_uses int, p_note text, p_expires_at timestamptz, p_active boolean, p_community uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ic public.invite_codes%rowtype;
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into ic from public.invite_codes where code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 1000000 then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  if p_max_uses < ic.uses then
    raise exception 'max_below_uses' using errcode = 'P0001';
  end if;
  update public.invite_codes set
    max_uses = p_max_uses,
    note = nullif(btrim(p_note), ''),
    expires_at = p_expires_at,
    disabled_at = case when p_active then null else coalesce(ic.disabled_at, now()) end,
    community_id = p_community
  where code = ic.code;
end;
$$;
revoke execute on function public.update_invite_code(text, int, text, timestamptz, boolean, uuid) from public, anon;
grant execute on function public.update_invite_code(text, int, text, timestamptz, boolean, uuid) to authenticated;

drop function if exists public.list_invite_codes();
create function public.list_invite_codes()
returns table (code text, note text, max_uses int, uses int, expires_at timestamptz, created_at timestamptz, disabled_at timestamptz,
               community_id uuid, community_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select c.code, c.note, c.max_uses, c.uses, c.expires_at, c.created_at, c.disabled_at, c.community_id, co.name
    from public.invite_codes c left join public.communities co on co.id = c.community_id
    order by c.created_at desc limit 500;
end;
$$;
revoke execute on function public.list_invite_codes() from public, anon;
grant execute on function public.list_invite_codes() to authenticated;

-- Tells the sign-up form which community a code leads to ("Entrarás en la comunidad de Carlos").
create or replace function public.invite_code_community(p_code text)
returns text language sql stable security definer set search_path = '' as $$
  select co.name from public.invite_codes c join public.communities co on co.id = c.community_id
  where c.code = upper(btrim(p_code)) and c.disabled_at is null
    and c.uses < c.max_uses and (c.expires_at is null or c.expires_at > now());
$$;
revoke execute on function public.invite_code_community(text) from public;
grant execute on function public.invite_code_community(text) to anon, authenticated;

-- Sign-up trigger: as before, plus joining the code's community.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  mode text;
  v_code text;
  ic public.invite_codes%rowtype;
begin
  if coalesce((meta ->> 'adult_confirmed')::boolean, false) is not true
     or coalesce((meta ->> 'terms_accepted')::boolean, false) is not true
     or coalesce((meta ->> 'privacy_accepted')::boolean, false) is not true
     or coalesce((meta ->> 'health_data_consent')::boolean, false) is not true then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  mode := public.signup_mode();
  v_code := nullif(upper(btrim(coalesce(meta ->> 'invite_code', ''))), '');
  if mode = 'closed' then
    raise exception 'signups_closed' using errcode = 'P0001';
  end if;
  if mode = 'invite' or v_code is not null then
    select * into ic from public.invite_codes where invite_codes.code = v_code for update;
    if not found or ic.disabled_at is not null or ic.uses >= ic.max_uses
       or (ic.expires_at is not null and ic.expires_at <= now()) then
      raise exception 'invalid_invite' using errcode = 'P0001';
    end if;
    update public.invite_codes set uses = uses + 1 where invite_codes.code = v_code;
  end if;

  insert into public.profiles (
    id, adult_confirmed_at, terms_accepted_at, privacy_accepted_at, health_data_consent_at, consent_version
  ) values (
    new.id, now(), now(), now(), now(), coalesce(nullif(meta ->> 'consent_version', ''), 'unknown')
  );

  if v_code is not null then
    insert into public.invite_redemptions (user_id, code) values (new.id, v_code);
    if ic.community_id is not null then
      insert into public.conversation_participants (conversation_id, user_id)
      select c.id, new.id from public.conversations c where c.community_id = ic.community_id
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
