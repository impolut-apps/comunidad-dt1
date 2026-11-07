# Tribu T1 (working name)

> **Find your people.** A mobile-first social network for adults (18+) living with Type 1 Diabetes.
> A social platform, not a medical app.

The name is a placeholder: change `VITE_APP_NAME` in `.env` (or the default in `brand.config.ts`)
and it updates the UI, page title and PWA manifest.

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for architecture, schema, milestones, risks and open decisions.

## Stack

React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · TanStack Query · Supabase (Auth, Postgres + RLS, Storage,
Realtime, Edge Functions) · PWA (vite-plugin-pwa) · Vercel.

## Local development

```bash
npm install
cp .env.example .env        # then fill in your Supabase URL + anon key
npm run dev                 # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build (`dist/`) |
| `npm run typecheck` | TypeScript only |
| `npm run test:db` | Runs all migrations in PGlite (in-process Postgres) and the RLS/security test suite (63 tests) |
| `node scripts/make-icons.mjs` | Regenerates placeholder PWA icons |

`npm run test:db` needs no Docker and no Supabase account. It uses a stub of Supabase's `auth` and `storage`
schemas (`supabase/tests/supabase-stub.sql`), so a final check on a real Supabase project is still required.

## Supabase setup (manual, one time)

1. **Create a project** in an EU region (e.g. `eu-west-1` / Frankfurt) — the data includes health information.
2. **Apply migrations** (in order, from `supabase/migrations/`):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   Or paste each file into the SQL editor in order.
3. **Auth → Providers → Email**: enable email provider, **Confirm email = ON**, minimum password length 8.
4. **Auth → URL configuration**: Site URL = your production URL; add `http://localhost:5173/**` and
   `https://<your-domain>/**` to redirect URLs.
5. **Auth → SMTP**: configure a custom SMTP provider before launch (the built-in one is heavily rate-limited).
6. **Auth → Email templates**: translate the confirmation / reset emails to Spanish and apply the brand.
7. **Edge Function** (account deletion):
   ```bash
   npx supabase functions deploy delete-account
   npx supabase secrets set ALLOWED_ORIGIN=https://<your-domain>
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
8. **Moderators**: in the SQL editor, `update public.profiles set is_moderator = true where username = '...';`
   (deliberately not possible from the app).
9. **Topic groups** (Mensajes → Grupos) are curated by the team. Add or edit them in the SQL editor:
   ```sql
   insert into public.conversations (kind, title, description, emoji, sort_order)
   values ('group', 'Padel Madrid', 'Para organizar partidos en Madrid.', '🎾', 110);
   -- rename: update public.conversations set title = '...' where id = '...';
   ```
10. Copy the project URL and **anon/publishable key** into `.env` / Vercel. **Never** use the service-role key in the frontend.

## Deploy (Vercel)

1. Import the repo in Vercel (framework: Vite; build `npm run build`; output `dist`).
2. Set env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, `VITE_APP_NAME`, `VITE_APP_SHORT_NAME`.
3. `vercel.json` handles SPA rewrites and basic security headers.

## Security model (summary)

- Every table has RLS; anonymous visitors can read only the interests catalogue.
- Default Supabase grants are revoked; each table gets back only the privileges it needs, **column by column**
  (e.g. users cannot set `is_moderator`, `status`, consent timestamps or `moderation_status`).
- Sign-up fails in the database unless the 18+, terms/privacy and explicit health-data consents are present.
- "Member" = verified email + finished onboarding + not suspended. Non-members see nobody.
- Conversations can only be created through `start_direct_conversation()` (requires an accepted connection or a
  shared plan, and no block). Messages are readable only by participants.
- Blocking hides both people from each other everywhere and removes their connection.
- Avatars are in a **private** bucket, re-encoded client-side (strips EXIF/GPS), served via signed URLs.
- No coordinates are stored anywhere; location is country + city text.

## Project status

See the milestone table in DEVELOPMENT_PLAN.md. As of 6 Nov 2026:

- ✅ Database schema, RLS, triggers, RPCs — verified with the PGlite suite (not yet on a real Supabase project)
- ✅ Design system, light/dark theme, PWA manifest, app shell with bottom nav / desktop sidebar
- ✅ Auth screens, onboarding, own profile view/edit, settings — **UI built; not yet verified end-to-end
  against a real Supabase project**
- ⏳ Discover, Plans, Messages, Feed, blocking/reporting UI, moderation queue — next milestones
