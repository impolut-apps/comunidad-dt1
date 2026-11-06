-- =====================================================================
-- Helper functions, triggers and RPCs.
-- Every SECURITY DEFINER function pins search_path = '' and fully
-- qualifies names, so it cannot be hijacked by objects in other schemas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers used by RLS policies
-- ---------------------------------------------------------------------

-- A "member" is signed in, has a verified email, finished onboarding and is not suspended.
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = auth.uid()
      and p.onboarded_at is not null
      and p.status = 'active'
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_moderator and status = 'active'
  );
$$;

-- True if either user has blocked the other. Definer so it can see blocks made by the other side
-- (users can never list who blocked them).
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.are_connected(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  );
$$;

create or replace function public.shares_activity(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.activity_participants pa
    join public.activity_participants pb on pb.activity_id = pa.activity_id
    where pa.user_id = a and pb.user_id = b
  );
$$;

-- Avoids recursive RLS on conversation_participants.
create or replace function public.is_conversation_participant(conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conv and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------
-- Generic updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger activities_updated_at before update on public.activities
  for each row execute function public.set_updated_at();
create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();
create trigger comments_updated_at before update on public.comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Sign-up: create the profile and REQUIRE the four consents.
-- The client passes them as user metadata in supabase.auth.signUp().
-- If any is missing the whole sign-up fails — this is enforced server-side.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce((meta ->> 'adult_confirmed')::boolean, false) is not true
     or coalesce((meta ->> 'terms_accepted')::boolean, false) is not true
     or coalesce((meta ->> 'privacy_accepted')::boolean, false) is not true
     or coalesce((meta ->> 'health_data_consent')::boolean, false) is not true then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  insert into public.profiles (
    id, adult_confirmed_at, terms_accepted_at, privacy_accepted_at, health_data_consent_at, consent_version
  ) values (
    new.id, now(), now(), now(), now(), coalesce(nullif(meta ->> 'consent_version', ''), 'unknown')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- onboarded_at: the client may set it once (value is replaced by now()); it can never be cleared.
-- Finishing onboarding requires a verified email, so "onboarded" always implies "verified".
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.onboarded_at is not null then
    new.onboarded_at := old.onboarded_at;
  elsif new.onboarded_at is not null then
    if not exists (select 1 from auth.users where id = new.id and email_confirmed_at is not null) then
      raise exception 'email_not_verified' using errcode = 'P0001';
    end if;
    new.onboarded_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Username availability during onboarding (before the user can see other profiles).
create or replace function public.username_available(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and lower(btrim(name)) ~ '^[a-z0-9_]{3,20}$'
    and not exists (select 1 from public.profiles where username = lower(btrim(name)) and id <> auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Interests: at most 12 per person
-- ---------------------------------------------------------------------
create or replace function public.limit_user_interests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.user_interests where user_id = new.user_id) >= 12 then
    raise exception 'too_many_interests' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger user_interests_limit before insert on public.user_interests
  for each row execute function public.limit_user_interests();

-- ---------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------
create or replace function public.on_connection_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, actor_id, entity_id)
    values (new.addressee_id, 'connection_request', new.requester_id, new.id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications (user_id, type, actor_id, entity_id)
    values (new.requester_id, 'connection_accepted', new.addressee_id, new.id);
  end if;
  return new;
end;
$$;

create or replace function public.before_connection_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

create trigger connections_before_update before update on public.connections
  for each row execute function public.before_connection_update();
create trigger connections_notify after insert or update on public.connections
  for each row execute function public.on_connection_change();

-- ---------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------
create or replace function public.validate_activity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.starts_at <= now() then
    raise exception 'activity_in_past' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at and new.starts_at <= now() then
    raise exception 'activity_in_past' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger activities_validate before insert or update on public.activities
  for each row execute function public.validate_activity();

-- Organizer is automatically a participant.
create or replace function public.add_organizer_as_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity_participants (activity_id, user_id) values (new.id, new.organizer_id);
  return new;
end;
$$;

create trigger activities_add_organizer after insert on public.activities
  for each row execute function public.add_organizer_as_participant();

-- Join rules: open, not started, not full, not blocked by the organizer.
-- The activity row is locked so two people cannot take the last spot at once.
create or replace function public.validate_activity_join()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  act public.activities%rowtype;
  taken int;
begin
  select * into act from public.activities where id = new.activity_id for update;
  if not found then
    raise exception 'activity_not_found' using errcode = 'P0001';
  end if;
  if new.user_id = act.organizer_id then
    return new; -- organizer auto-join
  end if;
  if act.status <> 'open' then
    raise exception 'activity_not_open' using errcode = 'P0001';
  end if;
  if act.starts_at <= now() then
    raise exception 'activity_in_past' using errcode = 'P0001';
  end if;
  if public.is_blocked(new.user_id, act.organizer_id) then
    raise exception 'activity_not_found' using errcode = 'P0001';
  end if;
  if act.max_participants is not null then
    select count(*) into taken from public.activity_participants where activity_id = act.id;
    if taken >= act.max_participants then
      raise exception 'activity_full' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger activity_participants_validate before insert on public.activity_participants
  for each row execute function public.validate_activity_join();

create or replace function public.notify_activity_join()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  org uuid;
begin
  select organizer_id into org from public.activities where id = new.activity_id;
  if org is not null and org <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, entity_id)
    values (org, 'activity_joined', new.user_id, new.activity_id);
  end if;
  return new;
end;
$$;

create trigger activity_participants_notify after insert on public.activity_participants
  for each row execute function public.notify_activity_join();

-- ---------------------------------------------------------------------
-- Feed
-- ---------------------------------------------------------------------
create or replace function public.notify_post_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  post_author uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is not null and post_author <> new.author_id then
    insert into public.notifications (user_id, type, actor_id, entity_id)
    values (post_author, 'post_comment', new.author_id, new.post_id);
  end if;
  return new;
end;
$$;

create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_post_comment();

-- ---------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  -- Sending a message means you have read the conversation up to it.
  update public.conversation_participants set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end;
$$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_insert();

-- Start (or reuse) a 1:1 conversation. Allowed only with an accepted connection
-- or a shared activity, and never between users who have blocked each other.
create or replace function public.start_direct_conversation(other_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  key text;
  conv uuid;
begin
  if me is null or not public.is_member() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if other_user is null or other_user = me then
    raise exception 'invalid_user' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = other_user and onboarded_at is not null and status = 'active'
  ) or public.is_blocked(me, other_user) then
    raise exception 'user_not_found' using errcode = 'P0001';
  end if;
  if not (public.are_connected(me, other_user) or public.shares_activity(me, other_user)) then
    raise exception 'connection_required' using errcode = 'P0001';
  end if;

  key := least(me, other_user)::text || '_' || greatest(me, other_user)::text;

  insert into public.conversations (direct_key) values (key)
    on conflict (direct_key) do nothing
    returning id into conv;

  if conv is null then
    select id into conv from public.conversations where direct_key = key;
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
    values (conv, me), (conv, other_user)
    on conflict do nothing;

  return conv;
end;
$$;

-- Unread counts for the inbox in one round-trip.
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
    lm.body,
    lm.sender_id,
    (select count(*) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at)
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  join public.conversation_participants other
    on other.conversation_id = c.id and other.user_id <> me.user_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- ---------------------------------------------------------------------
-- Blocking removes any connection between the two people.
-- ---------------------------------------------------------------------
create or replace function public.on_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.connections
  where least(requester_id, addressee_id) = least(new.blocker_id, new.blocked_id)
    and greatest(requester_id, addressee_id) = greatest(new.blocker_id, new.blocked_id);
  return new;
end;
$$;

create trigger blocked_users_after_insert after insert on public.blocked_users
  for each row execute function public.on_block();

-- Blocks hide profiles both ways, so the "people I blocked" list needs this narrow definer
-- function: it only ever returns people the caller blocked, and only display fields.
create or replace function public.my_blocked_users()
returns table (id uuid, username text, display_name text, avatar_path text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_path, b.created_at
  from public.blocked_users b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- ---------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------
-- Validate the target exists and, at 3 distinct open reports, hide posts/comments pending review.
create or replace function public.on_report_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ok boolean;
begin
  ok := case new.target_type
    when 'user' then exists (select 1 from public.profiles where id = new.target_id)
    when 'post' then exists (select 1 from public.posts where id = new.target_id)
    when 'comment' then exists (select 1 from public.comments where id = new.target_id)
    when 'activity' then exists (select 1 from public.activities where id = new.target_id)
    when 'message' then exists (
      select 1 from public.messages m
      join public.conversation_participants cp on cp.conversation_id = m.conversation_id
      where m.id = new.target_id and cp.user_id = new.reporter_id)
  end;
  if not ok then
    raise exception 'report_target_not_found' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger reports_validate before insert on public.reports
  for each row execute function public.on_report_insert();

create or replace function public.auto_hide_reported()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if new.target_type not in ('post', 'comment') then
    return new;
  end if;
  select count(distinct reporter_id) into n from public.reports
    where target_type = new.target_type and target_id = new.target_id and status in ('open', 'reviewing');
  if n >= 3 then
    if new.target_type = 'post' then
      update public.posts set moderation_status = 'hidden' where id = new.target_id;
    else
      update public.comments set moderation_status = 'hidden' where id = new.target_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger reports_auto_hide after insert on public.reports
  for each row execute function public.auto_hide_reported();

-- Moderator: resolve a report and optionally act on its target.
-- action: 'dismiss' | 'hide' | 'restore' | 'suspend_user' | 'delete_activity'
create or replace function public.moderate_report(report_id uuid, action text, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.reports%rowtype;
  owner uuid;
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into r from public.reports where id = report_id for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;

  if action = 'hide' or action = 'restore' then
    if r.target_type = 'post' then
      update public.posts set moderation_status = case when action = 'hide' then 'hidden' else 'visible' end::public.moderation_status
        where id = r.target_id;
    elsif r.target_type = 'comment' then
      update public.comments set moderation_status = case when action = 'hide' then 'hidden' else 'visible' end::public.moderation_status
        where id = r.target_id;
    else
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
  elsif action = 'suspend_user' then
    owner := case r.target_type
      when 'user' then r.target_id
      when 'post' then (select author_id from public.posts where id = r.target_id)
      when 'comment' then (select author_id from public.comments where id = r.target_id)
      when 'activity' then (select organizer_id from public.activities where id = r.target_id)
      when 'message' then (select sender_id from public.messages where id = r.target_id)
    end;
    if owner is null or owner = auth.uid() then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    update public.profiles set status = 'suspended' where id = owner;
  elsif action = 'delete_activity' then
    if r.target_type <> 'activity' then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    delete from public.activities where id = r.target_id;
  elsif action <> 'dismiss' then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;

  -- Resolve every open report on the same target together.
  update public.reports
    set status = case when action = 'dismiss' or action = 'restore' then 'dismissed' else 'actioned' end::public.report_status,
        resolved_by = auth.uid(), resolved_at = now(), resolution_note = note
    where target_type = r.target_type and target_id = r.target_id and status in ('open', 'reviewing');
end;
$$;

-- Moderator: preview what a report points at (including reported private messages).
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
    when 'user' then (select jsonb_build_object('author_id', id, 'text', coalesce(display_name, '') || ' (@' || coalesce(username, '') || ') ' || coalesce(bio, ''), 'status', status) from public.profiles where id = r.target_id)
    when 'post' then (select jsonb_build_object('author_id', author_id, 'text', body, 'status', moderation_status) from public.posts where id = r.target_id)
    when 'comment' then (select jsonb_build_object('author_id', author_id, 'text', body, 'status', moderation_status) from public.comments where id = r.target_id)
    when 'activity' then (select jsonb_build_object('author_id', organizer_id, 'text', title || ' — ' || coalesce(description, ''), 'status', status) from public.activities where id = r.target_id)
    when 'message' then (select jsonb_build_object('author_id', sender_id, 'text', body) from public.messages where id = r.target_id)
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Discovery. SECURITY INVOKER: the caller's RLS still applies, so blocked,
-- suspended and un-onboarded profiles are never returned.
-- ---------------------------------------------------------------------
create or replace function public.discover_people(
  p_country text default null,
  p_city text default null,
  p_interest_ids smallint[] default null,
  p_query text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  bio text,
  country text,
  city text,
  t1d_since smallint,
  created_at timestamptz,
  shared_interests int,
  same_city boolean
) language sql stable security invoker set search_path = '' as $$
  with me as (
    select p.country, p.city_key from public.profiles p where p.id = auth.uid()
  ), mine as (
    select interest_id from public.user_interests where user_id = auth.uid()
  )
  select
    p.id, p.username, p.display_name, p.avatar_path, p.bio, p.country, p.city, p.t1d_since, p.created_at,
    (select count(*)::int from public.user_interests ui where ui.user_id = p.id and ui.interest_id in (select interest_id from mine)),
    (p.country = me.country and p.city_key = me.city_key)
  from public.profiles p, me
  where p.id <> auth.uid()
    and p.onboarded_at is not null
    and p.status = 'active'
    and (p_country is null or p.country = p_country)
    and (p_city is null or p.city_key = lower(btrim(p_city)))
    and (p_interest_ids is null or exists (
      select 1 from public.user_interests ui where ui.user_id = p.id and ui.interest_id = any (p_interest_ids)))
    and (p_query is null or p.username like lower(btrim(p_query)) || '%' or p.display_name ilike '%' || btrim(p_query) || '%')
  order by
    (p.country = me.country and p.city_key = me.city_key) desc,
    (p.country = me.country) desc,
    10 desc, -- shared_interests
    p.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;
