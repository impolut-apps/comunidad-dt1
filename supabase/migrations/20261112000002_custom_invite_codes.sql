-- =====================================================================
-- Custom invite codes ("regístrate con el código CARLOS")
--  * Moderators can pick the code text instead of a random one.
--  * Codes also work while sign-up is OPEN: the code is optional then, but when
--    someone uses one it is validated, counted and recorded, so each influencer's
--    sign-ups can be measured (and rewarded later).
-- Additive and backwards compatible with the app currently in production.
-- =====================================================================

-- Short, memorable codes (3+ chars) and room for big audiences.
alter table public.invite_codes drop constraint if exists invite_codes_code_check;
alter table public.invite_codes add constraint invite_codes_code_check check (code ~ '^[A-Z0-9-]{3,24}$');
alter table public.invite_codes drop constraint if exists invite_codes_max_uses_check;
alter table public.invite_codes add constraint invite_codes_max_uses_check check (max_uses between 1 and 1000000);

create or replace function public.create_invite_code(p_code text, p_max_uses int default 1000000, p_note text default null, p_days int default null)
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
    insert into public.invite_codes (code, note, max_uses, expires_at, created_by)
    values (v_code, nullif(btrim(p_note), ''), p_max_uses,
            case when p_days is not null then now() + make_interval(days => p_days) end, auth.uid());
  exception when unique_violation then
    raise exception 'code_taken' using errcode = 'P0001';
  end;
  return v_code;
end;
$$;
revoke execute on function public.create_invite_code(text, int, text, int) from public, anon;
grant execute on function public.create_invite_code(text, int, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- Edit, pause and delete codes (moderators only)
-- ---------------------------------------------------------------------
alter table public.invite_codes add column if not exists disabled_at timestamptz;

-- Note, usage cap, expiry and paused state. The code text itself is fixed: people may
-- already have it, and renaming would break the links they shared.
create or replace function public.update_invite_code(p_code text, p_max_uses int, p_note text, p_expires_at timestamptz, p_active boolean)
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
    disabled_at = case when p_active then null else coalesce(ic.disabled_at, now()) end
  where code = ic.code;
end;
$$;

-- Deleting also forgets who signed up with it (their accounts are untouched).
-- To stop a code but keep its numbers, pause it instead.
create or replace function public.delete_invite_code(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.invite_codes where code = upper(btrim(p_code));
  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.update_invite_code(text, int, text, timestamptz, boolean) from public, anon;
revoke execute on function public.delete_invite_code(text) from public, anon;
grant execute on function public.update_invite_code(text, int, text, timestamptz, boolean) to authenticated;
grant execute on function public.delete_invite_code(text) to authenticated;

-- The list now says whether each code is paused.
drop function if exists public.list_invite_codes();
create function public.list_invite_codes()
returns table (code text, note text, max_uses int, uses int, expires_at timestamptz, created_at timestamptz, disabled_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
    select c.code, c.note, c.max_uses, c.uses, c.expires_at, c.created_at, c.disabled_at
    from public.invite_codes c order by c.created_at desc limit 500;
end;
$$;
revoke execute on function public.list_invite_codes() from public, anon;
grant execute on function public.list_invite_codes() to authenticated;

-- Paused codes are not valid.
create or replace function public.check_invite_code(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invite_codes c
    where c.code = upper(btrim(p_code))
      and c.disabled_at is null
      and c.uses < c.max_uses
      and (c.expires_at is null or c.expires_at > now())
  );
$$;

-- Sign-up trigger: identical to before, except that a code given while sign-up is
-- open is now honoured (validated + counted + recorded) instead of ignored.
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
  end if;
  return new;
end;
$$;
