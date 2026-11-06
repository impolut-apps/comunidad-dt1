# Development Plan — T1D social platform (working name configurable)

> "Find your people." A mobile-first social network for adults (18+) living with Type 1 Diabetes.
> **Not a medical app.** Diabetes is what brings people together; it is not their whole identity.

Launch target: **14 Nov 2026 (World Diabetes Day)**. As of 6 Nov 2026 that is 8 days away, so the plan
below favours a small, polished, secure core over breadth.

---

## 1. Audit (6 Nov 2026)

| Item | Finding |
|---|---|
| Project directory | Empty. No existing code, config or git repo. Nothing to preserve. |
| Toolchain | Node 25, npm 11, Git 2.54, Supabase CLI via `npx`. **No Docker / no local Postgres.** |
| Supabase account | 2 active projects, both unrelated ("IMPO.LUT Cliente", "impolutcars@gmail.com"). **Neither will be touched.** A new project is needed (see decision D1). |

Because there is no Docker, the database is verified with **PGlite** (Postgres compiled to WASM, dev-only)
plus a small stub of Supabase's `auth`/`storage` schemas. This lets us run every migration and exercise
RLS policies as different users locally, at no cost. It is not a substitute for a final check on a real
Supabase project before launch.

---

## 2. Architecture

```
Browser (PWA, React SPA)  ──►  Supabase
  Vite + React + TS              ├─ Auth (email + password, email verification, password reset)
  Tailwind v4 (design tokens)    ├─ Postgres + RLS  ← all permissions enforced here
  React Router                   ├─ RPC functions (security definer, narrow, validated)
  TanStack Query (cache/states)  ├─ Realtime (postgres_changes on messages, RLS-filtered)
  supabase-js (anon key only)    ├─ Storage (private `avatars` bucket, per-user folders)
                                 └─ Edge Function `delete-account` (only place service role is used)
Hosting: Vercel (static SPA + rewrites)
```

Key decisions and why:

- **SPA, no custom backend server.** Supabase + RLS covers our needs; a Node API would double the
  security surface and the work. Logic that must not be trusted to the client lives in Postgres
  (constraints, triggers, `security definer` RPCs) or in one Edge Function.
- **TanStack Query** is the only "extra" runtime dependency beyond the stack. It removes a whole class of
  loading/error/cache bugs for very little code. Icons: `lucide-react` (tree-shaken).
- **Plus Jakarta Sans is self-hosted** (`@fontsource-variable`), not loaded from Google Fonts — avoids
  sending visitors' IPs to Google (relevant under GDPR) and works offline in the PWA.
- **Brand name is one config value** (`brand.config.ts` / `VITE_APP_NAME`), used by the UI, the HTML title
  and the PWA manifest.
- **UI copy is Spanish first.** Strings are kept in components for speed; extracting to an i18n catalogue
  is a mechanical step that does not change the architecture. Interests already store `label_es`/`label_en`.
- **Location is text only** (country ISO code + city name). No coordinates are ever stored, so "nearby"
  means same city, then same country. This is a privacy feature, not a limitation.
- **Avatars live in a private bucket** and are served via short-lived signed URLs to signed-in members only.
  A face plus membership of this community reveals health data; it must not be world-readable.

---

## 3. Database schema (summary — full SQL in `supabase/migrations/`)

All IDs are UUID except the interests catalogue. All tables have RLS enabled. Anonymous users can read
**nothing** except the interests catalogue.

| Table | Purpose | Notes |
|---|---|---|
| `profiles` | 1:1 with `auth.users` | Created by trigger at sign-up. Username unique (case-insensitive). Consent timestamps stored here. Users may update only a whitelisted set of their own columns (column-level grants), so they cannot make themselves moderators. |
| `interests` | Catalogue (seeded) | `slug`, `label_es`, `label_en`, `emoji`. Read-only for clients. |
| `user_interests` | profile ↔ interest | PK (user_id, interest_id). Max 12 per user. |
| `connections` | Friend requests | `pending` / `accepted`. One row per pair regardless of direction (unique index on least/greatest). |
| `activities` | Plans / meetups | Category = interest. City + optional "area hint" only — never an address. Status `open`/`cancelled`. |
| `activity_participants` | Who is going | Organizer auto-joined. Capacity and "not in the past" enforced by trigger with row lock. |
| `posts`, `comments` | Community feed | Chronological. `moderation_status` (`visible`/`hidden`). |
| `reactions` | One reaction per user per post | Small fixed set (❤️ 🤗 💪 😂). |
| `conversations` | 1:1 chats (group-ready) | Created **only** via RPC `start_direct_conversation`, which checks: accepted connection **or** shared activity, and no block. |
| `conversation_participants` | Membership + `last_read_at` | Drives unread counts. |
| `messages` | Chat messages | Insert only by a participant, as themselves, when not blocked. Realtime respects RLS. |
| `blocked_users` | Blocks | Blocking hides profiles, posts, comments, activities and stops messages in both directions; removes any connection. |
| `reports` | User/post/comment/activity/message reports | Reporter sees own; moderators see and resolve all. 3 distinct reports auto-hide a post/comment pending review. |
| `notifications` | In-app notifications | Written only by triggers (connection request/accept, someone joined your plan, comment on your post). |

Removed from scope on purpose: no medical data tables, no coordinates, no follower graph separate from
connections, no group chats yet (schema allows them later).

---

## 4. Routes

| Path | Screen | Access |
|---|---|---|
| `/` | Landing ("Find your people") | public; signed-in → `/home` |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | Auth | public |
| `/legal/terms`, `/legal/privacy` | Legal placeholders | public |
| `/onboarding` | 4-step onboarding | signed in, not onboarded |
| `/home` | Community feed | member |
| `/posts/:id` | Post + comments | member |
| `/discover` | People: nearby, shared interests, search, filters | member |
| `/plans`, `/plans/new`, `/plans/:id` | Activities | member |
| `/messages`, `/messages/:id` | Inbox / conversation | member |
| `/profile`, `/profile/edit`, `/u/:username` | Profiles | member |
| `/settings` | Theme, blocked users, sign out, delete account | member |
| `/moderation` | Report queue | moderators |

"Member" = signed in, email verified, onboarding complete, account active.

---

## 5. Component structure

```
src/
  app/            router, providers, route guards, AppShell (bottom nav / desktop sidebar)
  components/ui/  Button, Input, Textarea, Select, Chip, Card, Avatar, Modal, Toast, Spinner,
                  Skeleton, EmptyState, Badge, Tabs
  features/
    auth/         pages + useSession
    onboarding/
    profiles/     ProfileCard, ProfilePage, EditProfile, avatar upload
    discover/
    activities/   ActivityCard, ActivityDetail, CreateActivity
    messages/     Inbox, Conversation (realtime)
    feed/         PostComposer, PostCard, Comments, Reactions
    safety/       ReportDialog, BlockButton, Moderation
    settings/
  lib/            supabase client, query client, formatters, validation
brand.config.ts   name, slogan, colours — single source of truth
supabase/
  migrations/     SQL migrations (schema, RLS, functions, seed of interests)
  functions/      delete-account (Edge Function)
  tests/          PGlite-based RLS test suite
```

---

## 6. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Plan + scaffold + design tokens | Builds, typechecks, PWA manifest present |
| M1 | Database + RLS | All migrations run; RLS test suite passes (PGlite) |
| M2 | Design system | All core components exist in light/dark |
| M3 | Auth + onboarding | Sign-up → verify → onboarding → home works against a real Supabase project |
| M4 | Profiles + Discover | Edit own profile, avatar upload, find people by city/interest/username |
| M5 | Plans | Create, browse, join/leave with capacity, detail page |
| M6 | Messaging | Start chat (connection/shared plan), realtime, unread |
| M7 | Feed | Post, comment, react, report |
| M8 | Safety + hardening | Block, report, moderation queue, delete account; security review |
| M9 | Launch prep | Vercel deploy, production Supabase config, SMTP, legal texts, smoke test on phones |

**Realistic note for 14 Nov:** M0–M7 in code is achievable; M9 depends on decisions below (project,
domain, SMTP, legal texts) that only you can make. Anything not verified end-to-end against a real
Supabase project will be reported as unverified, not as done.

---

## 7. Critical risks & dependencies

1. **Health data under GDPR (Art. 9).** Membership alone implies a person has T1D, so *every* account is
   special-category data. We collect explicit, separate consent at sign-up (stored with timestamp and
   version), minimise data, keep location coarse and avatars private. You still need: a privacy policy and
   terms written/reviewed by a lawyer, a DPIA, a record of processing, DPAs with Supabase and Vercel,
   EU data region, a process for access/erasure requests, and a breach procedure. **Technical safeguards do
   not make the product legally compliant by themselves.**
2. **Age assurance** is self-declaration (checkbox) in the MVP. Acceptable for many social apps, but
   should be reviewed legally.
3. **Email deliverability.** Supabase's built-in SMTP is rate-limited (a few emails/hour) and not for
   production. A custom SMTP provider (e.g. Resend, Postmark, Brevo — most have free tiers) is required
   for launch.
4. **Moderation capacity.** Someone must watch the report queue daily, especially at launch.
5. **Supabase free-tier limits** (pausing after inactivity on free plan, 500 MB DB, 1 GB storage).
   Fine for testing; for a real launch the Pro plan (≈ $25/month) is advisable — your decision.
6. **Cold start.** A social network with no people is empty. Empty states must invite action (create the
   first plan, invite a friend). Demo data only in development, never shown as real members.

## 8. Decisions that need your approval

- **D1 — Supabase project.** Your org already has two active projects (the free plan allows two). A
  third project for this app means either a paid plan or a separate free organisation/account. Which?
- **D2 — Hosting / domain.** Vercel free (Hobby) plan forbids commercial use; Pro is $20/month per member.
  Domain name pending brand choice.
- **D3 — SMTP provider** for auth emails (free tiers exist; needs a domain).
- **D4 — Brand name** (placeholder used until then).
- **D5 — Legal texts and DPO/lawyer review** before public launch.
