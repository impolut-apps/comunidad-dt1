-- =====================================================================
-- App statistics for moderators.
-- Privacy by design: only aggregate counts leave the database; activity
-- timestamps live in their own table that no client can read (no "online
-- status" for other users), and are stored with hour precision.
-- =====================================================================

create table public.user_activity (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null default now()
);
create index user_activity_last_active_idx on public.user_activity (last_active_at);

alter table public.user_activity enable row level security;
revoke all on public.user_activity from anon, authenticated;
-- No policies: only security-definer functions below touch this table.

-- Called by the app on load. Writes at most once per hour per person.
create or replace function public.touch_activity()
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.user_activity (user_id, last_active_at)
  select auth.uid(), date_trunc('hour', now())
  where public.is_member()
  on conflict (user_id) do update
    set last_active_at = excluded.last_active_at
    where public.user_activity.last_active_at < excluded.last_active_at;
$$;

-- All dashboard numbers in one round-trip. Moderators only.
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not public.is_moderator() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  with members as (
    select * from public.profiles where onboarded_at is not null and status = 'active'
  )
  select jsonb_build_object(
    'generated_at', now(),

    -- Sign-up funnel
    'funnel', jsonb_build_object(
      'registered', (select count(*) from auth.users),
      'verified',   (select count(*) from auth.users where email_confirmed_at is not null),
      'onboarded',  (select count(*) from public.profiles where onboarded_at is not null),
      'suspended',  (select count(*) from public.profiles where status = 'suspended')
    ),

    -- Active members (opened the app)
    'active', jsonb_build_object(
      'd1',  (select count(*) from public.user_activity where last_active_at > now() - interval '1 day'),
      'd7',  (select count(*) from public.user_activity where last_active_at > now() - interval '7 days'),
      'd30', (select count(*) from public.user_activity where last_active_at > now() - interval '30 days')
    ),

    -- People who created something in the last 30 days
    'contributors_30d', (
      select count(distinct u) from (
        select author_id u from public.posts where created_at > now() - interval '30 days'
        union all select author_id from public.comments where created_at > now() - interval '30 days'
        union all select sender_id from public.messages where created_at > now() - interval '30 days'
        union all select organizer_id from public.activities where created_at > now() - interval '30 days'
        union all select user_id from public.activity_participants where joined_at > now() - interval '30 days'
      ) x
    ),

    -- Of members who joined 7+ days ago, how many were active in the last 7 days
    'retention_7d', jsonb_build_object(
      'eligible', (select count(*) from members where onboarded_at < now() - interval '7 days'),
      'retained', (
        select count(*) from members m join public.user_activity a on a.user_id = m.id
        where m.onboarded_at < now() - interval '7 days' and a.last_active_at > now() - interval '7 days'
      )
    ),

    -- New members per day, last 30 days (zero-filled)
    'new_members_daily', (
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(n, 0)) order by d)
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d
      left join (
        select date_trunc('day', onboarded_at) as bucket, count(*) as n from public.profiles
        where onboarded_at > now() - interval '30 days' group by 1
      ) c on c.bucket = d
    ),

    'top_cities', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select initcap(city_key) as city, country, count(*) as count
        from members group by city_key, country order by count(*) desc, city_key limit 10
      ) t
    ), '[]'::jsonb),

    'countries', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select country, count(*) as count from members group by country order by count(*) desc limit 10
      ) t
    ), '[]'::jsonb),

    'top_interests', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select i.emoji, i.label_es as label, count(*) as count
        from public.user_interests ui
        join members m on m.id = ui.user_id
        join public.interests i on i.id = ui.interest_id
        group by i.id order by count(*) desc limit 10
      ) t
    ), '[]'::jsonb),

    'age_ranges', coalesce((
      select jsonb_agg(row_to_json(t) order by t.range) from (
        select coalesce(age_range::text, 'Sin indicar') as range, count(*) as count from members group by 1
      ) t
    ), '[]'::jsonb),

    -- Activity volume (counts only, never content)
    'content', jsonb_build_object(
      'posts_7d',        (select count(*) from public.posts where created_at > now() - interval '7 days'),
      'posts_30d',       (select count(*) from public.posts where created_at > now() - interval '30 days'),
      'comments_30d',    (select count(*) from public.comments where created_at > now() - interval '30 days'),
      'reactions_30d',   (select count(*) from public.reactions where created_at > now() - interval '30 days'),
      'messages_7d',     (select count(*) from public.messages where created_at > now() - interval '7 days'),
      'messages_30d',    (select count(*) from public.messages where created_at > now() - interval '30 days'),
      'connections',     (select count(*) from public.connections where status = 'accepted'),
      'connections_30d', (select count(*) from public.connections where status = 'accepted' and responded_at > now() - interval '30 days')
    ),

    'plans', jsonb_build_object(
      'upcoming',      (select count(*) from public.activities where status = 'open' and starts_at > now()),
      'created_30d',   (select count(*) from public.activities where created_at > now() - interval '30 days'),
      'joins_30d',     (
        select count(*) from public.activity_participants p join public.activities a on a.id = p.activity_id
        where p.joined_at > now() - interval '30 days' and p.user_id <> a.organizer_id
      ),
      'avg_attendees', (
        select round(avg(n), 1) from (
          select count(*) n from public.activity_participants p join public.activities a on a.id = p.activity_id
          where a.status = 'open' group by a.id
        ) x
      )
    ),

    'groups', coalesce((
      select jsonb_agg(row_to_json(t)) from (
        select c.emoji, c.title,
          (select count(*) from public.conversation_participants p where p.conversation_id = c.id) as members,
          (select count(*) from public.messages m where m.conversation_id = c.id and m.created_at > now() - interval '7 days') as messages_7d
        from public.conversations c where c.kind = 'group'
        order by members desc, c.sort_order
      ) t
    ), '[]'::jsonb),

    'moderation', jsonb_build_object(
      'open',              (select count(*) from public.reports where status in ('open', 'reviewing')),
      'resolved_30d',      (select count(*) from public.reports where resolved_at > now() - interval '30 days'),
      'avg_hours_to_resolve', (
        select round(extract(epoch from avg(resolved_at - created_at)) / 3600, 1)
        from public.reports where resolved_at > now() - interval '30 days'
      ),
      'hidden_posts',      (select count(*) from public.posts where moderation_status = 'hidden')
    )
  ) into result;

  return result;
end;
$$;

revoke execute on function public.touch_activity() from public, anon;
revoke execute on function public.admin_stats() from public, anon;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.admin_stats() to authenticated;
