-- =====================================================================
-- Launch controls (additive, backwards compatible):
--   1. Sign-up switch: 'open' | 'invite' | 'closed', flipped with one SQL line (no deploy)
--   2. Invite codes (single or multi-use, optional expiry), moderator-generated
--   3. More specific report reasons (illegal sales, scams, self-harm risk)
--   4. Authors are notified when their content is hidden pending review
--   5. "Appear in Discover" control for members
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Settings + sign-up mode
-- ---------------------------------------------------------------------
create table public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now(),
  constraint app_settings_signup_mode check (key <> 'signup_mode' or value in ('open', 'invite', 'closed'))
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value) values ('signup_mode', 'open');

-- The sign-up screen needs to know the mode before the visitor is signed in.
create or replace function public.signup_mode()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = 'signup_mode'), 'open');
$$;
revoke execute on function public.signup_mode() from public;
grant execute on function public.signup_mode() to anon, authenticated;

-- Emergency switch for moderators, from the app (open / invite / closed).
create or replace function public.set_signup_mode(p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_mode not in ('open', 'invite', 'closed') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  update public.app_settings set value = p_mode, updated_at = now() where key = 'signup_mode';
end;
$$;
revoke execute on function public.set_signup_mode(text) from public, anon;
grant execute on function public.set_signup_mode(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Invite codes
-- ---------------------------------------------------------------------
create table public.invite_codes (
  code       text primary key check (code ~ '^[A-Z0-9-]{4,24}$'),
  note       text check (char_length(note) <= 80),
  max_uses   int not null default 1 check (max_uses between 1 and 1000),
  uses       int not null default 0 check (uses >= 0),
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.invite_codes enable row level security;
revoke all on public.invite_codes from anon, authenticated;

create table public.invite_redemptions (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  code        text not null references public.invite_codes (code) on delete cascade,
  redeemed_at timestamptz not null default now()
);
alter table public.invite_redemptions enable row level security;
revoke all on public.invite_redemptions from anon, authenticated;
create index invite_redemptions_code_idx on public.invite_redemptions (code);

-- Lets the sign-up form say "that code isn't valid" before creating the account
-- (Supabase hides trigger errors behind a generic message). Codes are long and random.
create or replace function public.check_invite_code(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invite_codes c
    where c.code = upper(btrim(p_code))
      and c.uses < c.max_uses
      and (c.expires_at is null or c.expires_at > now())
  );
$$;
revoke execute on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- Moderators generate and review codes.
create or replace function public.generate_invite_codes(p_count int, p_max_uses int default 1, p_note text default null, p_days int default null)
returns setof text language plpgsql security definer set search_path = '' as $$
declare
  i int;
  new_code text;
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_count < 1 or p_count > 100 then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  for i in 1..p_count loop
    new_code := 'T1-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    insert into public.invite_codes (code, note, max_uses, expires_at, created_by)
    values (new_code, nullif(btrim(p_note), ''), p_max_uses, case when p_days is not null then now() + make_interval(days => p_days) end, auth.uid());
    return next new_code;
  end loop;
end;
$$;

create or replace function public.list_invite_codes()
returns table (code text, note text, max_uses int, uses int, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select c.code, c.note, c.max_uses, c.uses, c.expires_at, c.created_at
    from public.invite_codes c order by c.created_at desc limit 200;
end;
$$;

revoke execute on function public.generate_invite_codes(int, int, text, int) from public, anon;
revoke execute on function public.list_invite_codes() from public, anon;
grant execute on function public.generate_invite_codes(int, int, text, int) to authenticated;
grant execute on function public.list_invite_codes() to authenticated;

-- Sign-up trigger: same consents as before + the sign-up mode.
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
  if mode = 'closed' then
    raise exception 'signups_closed' using errcode = 'P0001';
  elsif mode = 'invite' then
    v_code := upper(btrim(coalesce(meta ->> 'invite_code', '')));
    select * into ic from public.invite_codes where invite_codes.code = v_code for update;
    if not found or ic.uses >= ic.max_uses or (ic.expires_at is not null and ic.expires_at <= now()) then
      raise exception 'invalid_invite' using errcode = 'P0001';
    end if;
    update public.invite_codes set uses = uses + 1 where invite_codes.code = v_code;
  end if;

  insert into public.profiles (
    id, adult_confirmed_at, terms_accepted_at, privacy_accepted_at, health_data_consent_at, consent_version
  ) values (
    new.id, now(), now(), now(), now(), coalesce(nullif(meta ->> 'consent_version', ''), 'unknown')
  );

  if mode = 'invite' then
    insert into public.invite_redemptions (user_id, code) values (new.id, v_code);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. More specific report reasons
-- ---------------------------------------------------------------------
alter type public.report_reason add value if not exists 'illegal_sale';
alter type public.report_reason add value if not exists 'scam';
alter type public.report_reason add value if not exists 'self_harm';

-- ---------------------------------------------------------------------
-- 4. Tell authors when their content is hidden pending review
-- ---------------------------------------------------------------------
alter type public.notification_type add value if not exists 'content_hidden';

create or replace function public.auto_hide_reported()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n int;
  author uuid;
begin
  if new.target_type not in ('post', 'comment') then
    return new;
  end if;
  select count(distinct reporter_id) into n from public.reports
    where target_type = new.target_type and target_id = new.target_id and status in ('open', 'reviewing');
  if n >= 3 then
    if new.target_type = 'post' then
      update public.posts set moderation_status = 'hidden'
        where id = new.target_id and moderation_status = 'visible' returning author_id into author;
    else
      update public.comments set moderation_status = 'hidden'
        where id = new.target_id and moderation_status = 'visible' returning author_id into author;
    end if;
    if author is not null then
      insert into public.notifications (user_id, type, entity_id) values (author, 'content_hidden', new.target_id);
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. "Appear in Discover" (members can still open a profile by link)
-- ---------------------------------------------------------------------
alter table public.profiles add column discoverable boolean not null default true;
grant update (discoverable) on public.profiles to authenticated;

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
    and p.discoverable
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
