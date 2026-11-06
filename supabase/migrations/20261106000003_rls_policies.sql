-- =====================================================================
-- Row Level Security + privileges.
-- Supabase grants ALL on public tables to anon/authenticated by default,
-- so we revoke everything and grant back only what each table needs —
-- column by column where a user must not touch certain fields.
-- `(select fn())` lets Postgres evaluate the helper once per query.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'interests', 'user_interests', 'connections', 'activities', 'activity_participants',
    'posts', 'comments', 'reactions', 'conversations', 'conversation_participants', 'messages',
    'blocked_users', 'reports', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- RPCs: signed-in users only.
revoke execute on function public.start_direct_conversation(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.moderate_report(uuid, text, text) from public, anon;
revoke execute on function public.report_target_preview(uuid) from public, anon;
revoke execute on function public.discover_people(text, text, smallint[], text, int, int) from public, anon;
revoke execute on function public.username_available(text) from public, anon;
revoke execute on function public.my_blocked_users() from public, anon;
grant execute on function public.my_blocked_users() to authenticated;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;
grant execute on function public.report_target_preview(uuid) to authenticated;
grant execute on function public.discover_people(text, text, smallint[], text, int, int) to authenticated;
-- Trigger functions are never called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_path, bio, country, city, age_range, t1d_since, t1d_note, onboarded_at)
  on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_moderator())
    or (
      (select public.is_member())
      and onboarded_at is not null
      and status = 'active'
      and not public.is_blocked((select auth.uid()), id)
    )
  );

create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- interests (public catalogue, read-only)
-- ---------------------------------------------------------------------
grant select on public.interests to anon, authenticated;
create policy interests_select on public.interests for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- user_interests
-- ---------------------------------------------------------------------
grant select, insert, delete on public.user_interests to authenticated;

create policy user_interests_select on public.user_interests for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_member()) and not public.is_blocked((select auth.uid()), user_id))
  );
create policy user_interests_insert on public.user_interests for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_interests_delete on public.user_interests for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- connections
-- ---------------------------------------------------------------------
grant select, delete on public.connections to authenticated;
grant insert (requester_id, addressee_id) on public.connections to authenticated;
grant update (status) on public.connections to authenticated;

create policy connections_select on public.connections for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy connections_insert on public.connections for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and (select public.is_member())
    and not public.is_blocked(requester_id, addressee_id)
    and exists (
      select 1 from public.profiles p
      where p.id = addressee_id and p.onboarded_at is not null and p.status = 'active'
    )
  );

-- Only the addressee can accept.
create policy connections_accept on public.connections for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

-- Either side can cancel, decline or remove.
create policy connections_delete on public.connections for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- ---------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------
grant select, delete on public.activities to authenticated;
grant insert (organizer_id, interest_id, title, description, starts_at, ends_at, country, city, area_hint, max_participants)
  on public.activities to authenticated;
grant update (interest_id, title, description, starts_at, ends_at, country, city, area_hint, max_participants, status)
  on public.activities to authenticated;

create policy activities_select on public.activities for select to authenticated
  using (
    organizer_id = (select auth.uid())
    or (select public.is_moderator())
    or ((select public.is_member()) and not public.is_blocked((select auth.uid()), organizer_id))
  );
create policy activities_insert on public.activities for insert to authenticated
  with check (organizer_id = (select auth.uid()) and (select public.is_member()));
create policy activities_update on public.activities for update to authenticated
  using (organizer_id = (select auth.uid()))
  with check (organizer_id = (select auth.uid()));
create policy activities_delete on public.activities for delete to authenticated
  using (organizer_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- activity_participants
-- ---------------------------------------------------------------------
grant select, delete on public.activity_participants to authenticated;
grant insert (activity_id, user_id) on public.activity_participants to authenticated;

create policy activity_participants_select on public.activity_participants for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_member()) and not public.is_blocked((select auth.uid()), user_id))
  );
-- Capacity, status and date are checked by the validate_activity_join trigger.
create policy activity_participants_insert on public.activity_participants for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_member()));
-- Leave (not your own plan — cancel it instead), or the organizer removes someone.
create policy activity_participants_delete on public.activity_participants for delete to authenticated
  using (
    (user_id = (select auth.uid()) and not exists (
      select 1 from public.activities a where a.id = activity_id and a.organizer_id = (select auth.uid())))
    or (user_id <> (select auth.uid()) and exists (
      select 1 from public.activities a where a.id = activity_id and a.organizer_id = (select auth.uid())))
  );

-- ---------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------
grant select, delete on public.posts to authenticated;
grant insert (author_id, body) on public.posts to authenticated;
grant update (body) on public.posts to authenticated;

create policy posts_select on public.posts for select to authenticated
  using (
    author_id = (select auth.uid())
    or (select public.is_moderator())
    or (
      (select public.is_member())
      and moderation_status = 'visible'
      and not public.is_blocked((select auth.uid()), author_id)
    )
  );
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_member()));
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
create policy posts_delete on public.posts for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_moderator()));

-- ---------------------------------------------------------------------
-- comments (parent post must be visible to the reader — checked via posts RLS)
-- ---------------------------------------------------------------------
grant select, delete on public.comments to authenticated;
grant insert (post_id, author_id, body) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;

create policy comments_select on public.comments for select to authenticated
  using (
    author_id = (select auth.uid())
    or (select public.is_moderator())
    or (
      (select public.is_member())
      and moderation_status = 'visible'
      and not public.is_blocked((select auth.uid()), author_id)
      and exists (select 1 from public.posts p where p.id = post_id)
    )
  );
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.is_member())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.moderation_status = 'visible'
        and not public.is_blocked((select auth.uid()), p.author_id)
    )
  );
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (select public.is_moderator())
    -- post authors can remove comments under their own post
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- reactions
-- ---------------------------------------------------------------------
grant select, delete on public.reactions to authenticated;
grant insert (post_id, user_id, kind) on public.reactions to authenticated;
grant update (kind) on public.reactions to authenticated;

create policy reactions_select on public.reactions for select to authenticated
  using (
    user_id = (select auth.uid())
    or ((select public.is_member()) and not public.is_blocked((select auth.uid()), user_id))
  );
create policy reactions_insert on public.reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_member())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.moderation_status = 'visible'
        and not public.is_blocked((select auth.uid()), p.author_id)
    )
  );
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- conversations: read-only for clients; created via start_direct_conversation()
-- ---------------------------------------------------------------------
grant select on public.conversations to authenticated;
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_participant(id));

grant select on public.conversation_participants to authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;
create policy conversation_participants_select on public.conversation_participants for select to authenticated
  using (public.is_conversation_participant(conversation_id));
create policy conversation_participants_update on public.conversation_participants for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_participant(conversation_id));

create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_member())
    and public.is_conversation_participant(conversation_id)
    -- no messaging across a block, in either direction
    and not exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id <> (select auth.uid())
        and public.is_blocked((select auth.uid()), cp.user_id)
    )
  );

-- ---------------------------------------------------------------------
-- blocked_users: you only ever see your own blocks
-- ---------------------------------------------------------------------
grant select, delete on public.blocked_users to authenticated;
grant insert (blocker_id, blocked_id) on public.blocked_users to authenticated;

create policy blocked_users_select on public.blocked_users for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocked_users_insert on public.blocked_users for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy blocked_users_delete on public.blocked_users for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- reports: file your own; moderators read all; resolution only via moderate_report()
-- ---------------------------------------------------------------------
grant select on public.reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason, details) on public.reports to authenticated;

create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_moderator()));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open');

-- ---------------------------------------------------------------------
-- notifications: written only by triggers
-- ---------------------------------------------------------------------
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Realtime: stream new messages and notifications (RLS is applied per subscriber).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.messages, public.notifications;
