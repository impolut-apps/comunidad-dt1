-- =====================================================================
-- Core schema: tables, constraints, indexes.
-- Policies and functions live in later migrations.
-- Principles: no medical records, no coordinates, everything behind RLS.
-- =====================================================================

create type public.age_range as enum ('18-24', '25-34', '35-44', '45-54', '55-64', '65+');
create type public.account_status as enum ('active', 'suspended');
create type public.moderation_status as enum ('visible', 'hidden');
create type public.connection_status as enum ('pending', 'accepted');
create type public.activity_status as enum ('open', 'cancelled');
create type public.reaction_kind as enum ('heart', 'hug', 'strong', 'laugh');
create type public.report_target as enum ('user', 'post', 'comment', 'activity', 'message');
create type public.report_reason as enum (
  'spam', 'harassment', 'hate', 'sexual', 'medical_misinformation', 'impersonation', 'underage', 'other'
);
create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type public.notification_type as enum (
  'connection_request', 'connection_accepted', 'activity_joined', 'post_comment'
);

-- ---------------------------------------------------------------------
-- profiles: 1:1 with auth.users, created by trigger on sign-up.
-- ---------------------------------------------------------------------
create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  username               text,
  display_name           text,
  avatar_path            text,
  bio                    text,
  country                text,
  city                   text,
  city_key               text generated always as (lower(btrim(city))) stored,
  age_range              public.age_range,
  t1d_since              smallint,
  t1d_note               text,
  is_moderator           boolean not null default false,
  status                 public.account_status not null default 'active',
  onboarded_at           timestamptz,
  -- Explicit consents captured at sign-up (GDPR Art. 9 — health data).
  adult_confirmed_at     timestamptz not null,
  terms_accepted_at      timestamptz not null,
  privacy_accepted_at    timestamptz not null,
  health_data_consent_at timestamptz not null,
  consent_version        text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 40),
  constraint profiles_bio_len check (char_length(bio) <= 300),
  constraint profiles_country_format check (country ~ '^[A-Z]{2}$'),
  constraint profiles_city_len check (char_length(btrim(city)) between 1 and 60),
  constraint profiles_t1d_since_range check (t1d_since between 1930 and 2100),
  constraint profiles_t1d_note_len check (char_length(t1d_note) <= 280),
  -- Avatars must live in the owner's own storage folder.
  constraint profiles_avatar_own_folder check (avatar_path is null or avatar_path like id::text || '/%'),
  constraint profiles_onboarding_complete check (
    onboarded_at is null
    or (username is not null and display_name is not null and country is not null and city is not null)
  )
);

create unique index profiles_username_key on public.profiles (username);
create index profiles_location_idx on public.profiles (country, city_key) where onboarded_at is not null;
create index profiles_created_idx on public.profiles (created_at desc) where onboarded_at is not null;

-- ---------------------------------------------------------------------
-- interests: small seeded catalogue
-- ---------------------------------------------------------------------
create table public.interests (
  id         smallint generated always as identity primary key,
  slug       text not null unique check (slug ~ '^[a-z0-9-]{2,30}$'),
  label_es   text not null,
  label_en   text not null,
  emoji      text not null,
  sort_order smallint not null default 0
);

create table public.user_interests (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  interest_id smallint not null references public.interests (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, interest_id)
);
create index user_interests_interest_idx on public.user_interests (interest_id);

-- ---------------------------------------------------------------------
-- connections: one row per pair, whichever direction it started
-- ---------------------------------------------------------------------
create table public.connections (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.connection_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_not_self check (requester_id <> addressee_id)
);
create unique index connections_pair_key
  on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee_idx on public.connections (addressee_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

-- ---------------------------------------------------------------------
-- activities (plans) — approximate location only, never an address
-- ---------------------------------------------------------------------
create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  organizer_id     uuid not null references public.profiles (id) on delete cascade,
  interest_id      smallint references public.interests (id) on delete set null,
  title            text not null,
  description      text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  country          text not null,
  city             text not null,
  city_key         text generated always as (lower(btrim(city))) stored,
  area_hint        text,
  max_participants smallint,
  status           public.activity_status not null default 'open',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint activities_title_len check (char_length(btrim(title)) between 3 and 80),
  constraint activities_description_len check (char_length(description) <= 1000),
  constraint activities_ends_after_start check (ends_at is null or ends_at > starts_at),
  constraint activities_country_format check (country ~ '^[A-Z]{2}$'),
  constraint activities_city_len check (char_length(btrim(city)) between 1 and 60),
  constraint activities_area_hint_len check (char_length(area_hint) <= 80),
  constraint activities_max_participants_range check (max_participants between 2 and 100)
);
create index activities_upcoming_idx on public.activities (starts_at) where status = 'open';
create index activities_location_idx on public.activities (country, city_key, starts_at);
create index activities_organizer_idx on public.activities (organizer_id);

create table public.activity_participants (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (activity_id, user_id)
);
create index activity_participants_user_idx on public.activity_participants (user_id);

-- ---------------------------------------------------------------------
-- community feed
-- ---------------------------------------------------------------------
create table public.posts (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references public.profiles (id) on delete cascade,
  body              text not null,
  moderation_status public.moderation_status not null default 'visible',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint posts_body_len check (char_length(btrim(body)) between 1 and 2000)
);
create index posts_feed_idx on public.posts (created_at desc) where moderation_status = 'visible';
create index posts_author_idx on public.posts (author_id, created_at desc);

create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.posts (id) on delete cascade,
  author_id         uuid not null references public.profiles (id) on delete cascade,
  body              text not null,
  moderation_status public.moderation_status not null default 'visible',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint comments_body_len check (char_length(btrim(body)) between 1 and 1000)
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_id);

create table public.reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.reaction_kind not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index reactions_user_idx on public.reactions (user_id);

-- ---------------------------------------------------------------------
-- messaging (1:1 now; participants table keeps group chats possible later)
-- ---------------------------------------------------------------------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  direct_key      text unique,          -- "<smaller uuid>_<larger uuid>" for 1:1 chats
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  constraint messages_body_len check (char_length(btrim(body)) between 1 and 2000)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);

-- ---------------------------------------------------------------------
-- safety
-- ---------------------------------------------------------------------
create table public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);
create index blocked_users_blocked_idx on public.blocked_users (blocked_id);

create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  target_type     public.report_target not null,
  target_id       uuid not null,
  reason          public.report_reason not null,
  details         text,
  status          public.report_status not null default 'open',
  created_at      timestamptz not null default now(),
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text,
  constraint reports_details_len check (char_length(details) <= 1000),
  constraint reports_one_per_target unique (reporter_id, target_type, target_id)
);
create index reports_queue_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       public.notification_type not null,
  actor_id   uuid references public.profiles (id) on delete cascade,
  entity_id  uuid,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
