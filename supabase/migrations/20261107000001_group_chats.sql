-- =====================================================================
-- Topic group chats ("Grupos"). Curated by the team for launch: groups are
-- created via SQL/moderators, any member can join or leave freely, and only
-- people inside a group can read its messages.
-- =====================================================================

create type public.conversation_kind as enum ('direct', 'group');

alter table public.conversations
  add column kind        public.conversation_kind not null default 'direct',
  add column title       text,
  add column description text,
  add column emoji       text,
  add column sort_order  smallint not null default 0,
  add column created_by  uuid references public.profiles (id) on delete set null,
  add constraint conversations_kind_fields check (
    (kind = 'direct' and direct_key is not null and title is null)
    or (kind = 'group' and direct_key is null and char_length(btrim(title)) between 3 and 60)
  ),
  add constraint conversations_description_len check (char_length(description) <= 300);

create index conversations_groups_idx on public.conversations (sort_order) where kind = 'group';

-- ---------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------

-- Groups are discoverable by every member; direct chats only by their two participants.
drop policy conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using (
    public.is_conversation_participant(id)
    or (kind = 'group' and (select public.is_member()))
  );

-- Join a group (yourself only, never a direct chat).
grant insert (conversation_id, user_id) on public.conversation_participants to authenticated;
create policy conversation_participants_join_group on public.conversation_participants for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_member())
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.kind = 'group')
  );

-- Leave a group (direct chats cannot be "left" this way).
grant delete on public.conversation_participants to authenticated;
create policy conversation_participants_leave_group on public.conversation_participants for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.kind = 'group')
  );

-- Reading: participants only, and never messages from someone you have blocked (or who blocked you).
drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    and not public.is_blocked((select auth.uid()), sender_id)
  );

-- Writing: in a direct chat a block stops messages; in a group a block only hides
-- each other's messages (one block must not silence someone in a whole group).
drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_member())
    and public.is_conversation_participant(conversation_id)
    and (
      exists (select 1 from public.conversations c where c.id = conversation_id and c.kind = 'group')
      or not exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = messages.conversation_id
          and cp.user_id <> (select auth.uid())
          and public.is_blocked((select auth.uid()), cp.user_id)
      )
    )
  );

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

-- The 1:1 inbox must ignore groups.
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
  join public.conversations c on c.id = me.conversation_id and c.kind = 'direct'
  join public.conversation_participants other
    on other.conversation_id = c.id and other.user_id <> me.user_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- Group directory + my groups in one call. Definer so it can count members of groups
-- the caller hasn't joined; message previews and unread counts only for joined groups.
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
    case when me.user_id is not null then lm.body end,
    case when me.user_id is not null then lm.display_name end,
    case when me.user_id is not null then (
      select count(*) from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at
        and not public.is_blocked(auth.uid(), m.sender_id)
    ) else 0 end
  from public.conversations c
  left join public.conversation_participants me on me.conversation_id = c.id and me.user_id = auth.uid()
  left join lateral (
    select m.body, pr.display_name from public.messages m
    join public.profiles pr on pr.id = m.sender_id
    where m.conversation_id = c.id and not public.is_blocked(auth.uid(), m.sender_id)
    order by m.created_at desc limit 1
  ) lm on true
  where c.kind = 'group' and public.is_member()
  order by me.user_id is null, coalesce(c.last_message_at, c.created_at) desc, c.sort_order;
$$;

revoke execute on function public.list_groups() from public, anon;
grant execute on function public.list_groups() to authenticated;

-- ---------------------------------------------------------------------
-- Launch groups (reference data). Edit freely; ordering via sort_order.
-- ---------------------------------------------------------------------
insert into public.conversations (kind, title, description, emoji, sort_order) values
  ('group', 'Charla general', 'Para hablar de todo un poco y conocernos.', '💬', 10),
  ('group', 'Recién llegados', 'Preséntate y conoce a la comunidad.', '👋', 20),
  ('group', 'Deporte y T1', 'Entrenos, carreras, partidos y cómo lo llevamos.', '🏃', 30),
  ('group', 'Viajar con T1', 'Destinos, aeropuertos, husos horarios y anécdotas de viaje.', '✈️', 40),
  ('group', 'Cocina y comida', 'Recetas, restaurantes y planes con buena mesa.', '🍽️', 50),
  ('group', 'Trabajo y estudios', 'Oposiciones, exámenes, entrevistas y día a día en el trabajo.', '💼', 60),
  ('group', 'Debut reciente', 'Si te diagnosticaron hace poco: experiencias y apoyo entre iguales.', '🌱', 70),
  ('group', 'Familia, pareja y amistad', 'Cómo se vive la T1 con la gente que quieres.', '❤️', 80),
  ('group', 'Tecnología y gadgets', 'Apps, wearables y tecnología en general.', '💻', 90),
  ('group', 'Ocio y cultura', 'Series, libros, música, juegos y planes de fin de semana.', '🎬', 100);
