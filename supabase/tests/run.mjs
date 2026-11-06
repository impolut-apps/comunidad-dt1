// Runs every migration against PGlite (in-process Postgres) and checks the
// security model by acting as different users. Usage: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '..', 'migrations')

const db = new PGlite()
await db.exec(readFileSync(join(here, 'supabase-stub.sql'), 'utf8'))
for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(migrationsDir, f), 'utf8'))
    console.log(`migrated  ${f}`)
  } catch (e) {
    console.error(`FAILED    ${f}\n  ${e.message}`)
    process.exit(1)
  }
}

// ---------- helpers ----------
let passed = 0
let failed = 0
const test = async (name, fn) => {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.log(`  ✗ ${name}\n      ${e.message}`)
  } finally {
    await db.exec('reset role; select set_config(\'request.jwt.claims\', \'\', false);')
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

/** Run a query as a given user (or anon when id is null), like PostgREST does. */
async function as(id, sql, params = []) {
  await db.exec(id ? 'set role authenticated' : 'set role anon')
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [id ? JSON.stringify({ sub: id, role: 'authenticated' }) : ''])
  try {
    return (await db.query(sql, params)).rows
  } finally {
    await db.exec('reset role')
  }
}
async function rejects(promise, pattern) {
  try {
    await promise
  } catch (e) {
    if (pattern && !new RegExp(pattern).test(e.message)) throw new Error(`wrong error: ${e.message}`)
    return
  }
  throw new Error('expected an error but the statement succeeded')
}

const consent = { adult_confirmed: true, terms_accepted: true, privacy_accepted: true, health_data_consent: true, consent_version: '2026-11-v1' }
async function createUser(email, { confirmed = true, meta = consent } = {}) {
  const r = await db.query(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3) returning id`,
    [email, confirmed ? new Date().toISOString() : null, meta],
  )
  return r.rows[0].id
}
async function onboard(id, username, city = 'Madrid', interests = ['padel', 'hiking']) {
  await as(id, `update public.profiles set username=$2, display_name=$3, country='ES', city=$4, onboarded_at=now() where id=$1`, [id, username, username, city])
  for (const slug of interests) {
    await as(id, `insert into public.user_interests (user_id, interest_id) select $1, id from public.interests where slug=$2`, [id, slug])
  }
}

// ---------- tests ----------
console.log('\nSign-up & profiles')
let A, B, C, M, U
await test('sign-up without the required consents is rejected', async () => {
  await rejects(createUser('x@test.dev', { meta: { adult_confirmed: true } }), 'consent_required')
})
await test('sign-up with consents creates a profile with timestamps', async () => {
  A = await createUser('a@test.dev')
  B = await createUser('b@test.dev')
  C = await createUser('c@test.dev')
  M = await createUser('m@test.dev')
  U = await createUser('u@test.dev', { confirmed: false })
  const r = await db.query('select * from public.profiles where id=$1', [A])
  assert(r.rows.length === 1 && r.rows[0].health_data_consent_at && r.rows[0].consent_version === '2026-11-v1', 'profile not created')
})
await test('non-onboarded user cannot see other profiles', async () => {
  await onboard(B, 'bea', 'Madrid', ['padel', 'music'])
  const rows = await as(A, 'select id from public.profiles')
  assert(rows.length === 1 && rows[0].id === A, `saw ${rows.length} profiles`)
})
await test('onboarding sets onboarded_at; members see each other', async () => {
  await onboard(A, 'alex', 'Madrid', ['padel', 'hiking'])
  await onboard(C, 'carla', 'Barcelona', ['gaming'])
  await onboard(M, 'mod', 'Sevilla', ['travel'])
  await rejects(onboard(U, 'unverified', 'Madrid'), 'email_not_verified')
  const rows = await as(A, 'select username from public.profiles order by username')
  assert(rows.map((r) => r.username).join() === 'alex,bea,carla,mod', JSON.stringify(rows))
})
await test('onboarded_at cannot be cleared by the user', async () => {
  await as(A, 'update public.profiles set onboarded_at=null where id=$1', [A])
  const r = await db.query('select onboarded_at from public.profiles where id=$1', [A])
  assert(r.rows[0].onboarded_at, 'onboarded_at was cleared')
})
await test('user cannot make themselves a moderator', async () => {
  await rejects(as(A, 'update public.profiles set is_moderator=true where id=$1', [A]), 'permission denied')
})
await test('user cannot un-suspend or change consents', async () => {
  await rejects(as(A, `update public.profiles set status='active' where id=$1`, [A]), 'permission denied')
  await rejects(as(A, `update public.profiles set health_data_consent_at=now() where id=$1`, [A]), 'permission denied')
})
await test("user cannot edit someone else's profile", async () => {
  await as(A, `update public.profiles set bio='hacked' where id=$1`, [B])
  const r = await db.query('select bio from public.profiles where id=$1', [B])
  assert(r.rows[0].bio === null, 'bio changed')
})
await test('avatar path must be inside own folder', async () => {
  await rejects(as(A, `update public.profiles set avatar_path=$2 where id=$1`, [A, `${B}/x.jpg`]), 'profiles_avatar_own_folder')
})
await test('unverified email is not a member (sees nobody, cannot post)', async () => {
  const rows = await as(U, 'select id from public.profiles')
  assert(rows.length === 1, `saw ${rows.length}`)
  await rejects(as(U, `insert into public.posts (author_id, body) values ($1, 'hola')`, [U]), 'row-level security')
})
await test('anonymous visitors see interests but no profiles', async () => {
  const i = await as(null, 'select count(*)::int n from public.interests')
  assert(i[0].n > 10, 'no interests')
  await rejects(as(null, 'select * from public.profiles'), 'permission denied')
})
await test('interest limit of 12 is enforced', async () => {
  const slugs = (await db.query(`select slug from public.interests where slug not in ('padel','hiking') limit 11`)).rows
  await rejects(
    (async () => {
      for (const { slug } of slugs) await as(A, `insert into public.user_interests (user_id, interest_id) select $1, id from public.interests where slug=$2`, [A, slug])
    })(),
    'too_many_interests',
  )
  await db.query(`delete from public.user_interests where user_id=$1 and interest_id not in (select id from public.interests where slug in ('padel','hiking'))`, [A])
})

console.log('\nDiscovery')
await test('discover_people ranks same city + shared interests first', async () => {
  const rows = await as(A, 'select username, shared_interests, same_city from public.discover_people()')
  assert(rows[0].username === 'bea' && rows[0].shared_interests === 1 && rows[0].same_city, JSON.stringify(rows))
  assert(!rows.some((r) => r.username === 'alex' || r.username === 'unverified'), 'returned self or non-member')
})
await test('discover_people filters by interest and username prefix', async () => {
  const byInterest = await as(A, `select username from public.discover_people(p_interest_ids => array[(select id from public.interests where slug='gaming')])`)
  assert(byInterest.length === 1 && byInterest[0].username === 'carla', JSON.stringify(byInterest))
  const byName = await as(A, `select username from public.discover_people(p_query => 'CAR')`)
  assert(byName.length === 1 && byName[0].username === 'carla', JSON.stringify(byName))
})

console.log('\nConnections & messaging')
let conv
await test('cannot start a conversation without a connection or shared plan', async () => {
  await rejects(as(A, 'select public.start_direct_conversation($1)', [B]), 'connection_required')
})
await test('connection request → notification → only addressee can accept', async () => {
  await as(A, 'insert into public.connections (requester_id, addressee_id) values ($1, $2)', [A, B])
  const n = await as(B, `select type from public.notifications`)
  assert(n.length === 1 && n[0].type === 'connection_request', JSON.stringify(n))
  await as(A, `update public.connections set status='accepted'`) // requester tries: no effect
  let r = await db.query('select status from public.connections')
  assert(r.rows[0].status === 'pending', 'requester accepted own request')
  await as(B, `update public.connections set status='accepted'`)
  r = await db.query('select status, responded_at from public.connections')
  assert(r.rows[0].status === 'accepted' && r.rows[0].responded_at, 'not accepted')
})
await test('cannot fake a request on behalf of someone else', async () => {
  await rejects(as(C, 'insert into public.connections (requester_id, addressee_id) values ($1, $2)', [B, C]), 'row-level security')
})
await test('duplicate request in the opposite direction is rejected', async () => {
  await rejects(as(B, 'insert into public.connections (requester_id, addressee_id) values ($1, $2)', [B, A]), 'duplicate key')
})
await test('connected users can start a conversation (idempotent) and message', async () => {
  conv = (await as(A, 'select public.start_direct_conversation($1) id', [B]))[0].id
  const again = (await as(B, 'select public.start_direct_conversation($1) id', [A]))[0].id
  assert(conv === again, 'created two conversations')
  await as(A, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hola!')`, [conv, A])
  const inbox = await as(B, 'select unread_count::int n, last_message_body from public.my_conversations()')
  assert(inbox[0].n === 1 && inbox[0].last_message_body === 'Hola!', JSON.stringify(inbox))
})
await test('outsiders cannot read or write the conversation', async () => {
  const rows = await as(C, 'select * from public.messages')
  assert(rows.length === 0, 'outsider read messages')
  const parts = await as(C, 'select * from public.conversation_participants')
  assert(parts.length === 0, 'outsider read participants')
  await rejects(as(C, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'spam')`, [conv, C]), 'row-level security')
})
await test('cannot send a message as someone else', async () => {
  await rejects(as(B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'fake')`, [conv, A]), 'row-level security')
})
await test('clients cannot create conversations directly', async () => {
  await rejects(as(C, 'insert into public.conversations (direct_key) values ($1)', ['x']), 'permission denied')
  await rejects(as(C, 'insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)', [conv, C]), 'permission denied|row-level security')
})
await test('marking as read only touches own participant row', async () => {
  await as(B, `update public.conversation_participants set last_read_at=now() where conversation_id=$1`, [conv])
  const inbox = await as(B, 'select unread_count::int n from public.my_conversations()')
  assert(inbox[0].n === 0, 'still unread')
})

console.log('\nActivities')
let act
await test('cannot create a plan in the past', async () => {
  await rejects(
    as(A, `insert into public.activities (organizer_id, title, starts_at, country, city) values ($1, 'Pádel', now() - interval '1 day', 'ES', 'Madrid')`, [A]),
    'activity_in_past',
  )
})
await test('create plan → organizer auto-joins', async () => {
  act = (await as(A, `insert into public.activities (organizer_id, title, starts_at, country, city, max_participants)
    values ($1, 'Pádel el sábado', now() + interval '3 days', 'ES', 'Madrid', 2) returning id`, [A]))[0].id
  const p = await db.query('select user_id from public.activity_participants where activity_id=$1', [act])
  assert(p.rows.length === 1 && p.rows[0].user_id === A, 'organizer not joined')
})
await test('cannot create a plan for someone else', async () => {
  await rejects(as(C, `insert into public.activities (organizer_id, title, starts_at, country, city) values ($1, 'x x x', now() + interval '1 day', 'ES', 'Madrid')`, [A]), 'row-level security')
})
await test('join respects capacity', async () => {
  await as(C, 'insert into public.activity_participants (activity_id, user_id) values ($1, $2)', [act, C])
  await rejects(as(B, 'insert into public.activity_participants (activity_id, user_id) values ($1, $2)', [act, B]), 'activity_full')
  const n = await as(A, 'select type from public.notifications where type = $1', ['activity_joined'])
  assert(n.length === 1, 'organizer not notified')
})
await test('shared plan allows messaging without a connection', async () => {
  const id = (await as(C, 'select public.start_direct_conversation($1) id', [A]))[0].id
  assert(id, 'no conversation')
})
await test('cannot add someone else to a plan', async () => {
  await rejects(as(C, 'insert into public.activity_participants (activity_id, user_id) values ($1, $2)', [act, B]), 'row-level security|activity_full')
})
await test('participant can leave; organizer cannot leave own plan', async () => {
  await as(A, 'delete from public.activity_participants where activity_id=$1 and user_id=$2', [act, A])
  let p = await db.query('select user_id from public.activity_participants where activity_id=$1', [act])
  assert(p.rows.some((r) => r.user_id === A), 'organizer left')
  await as(C, 'delete from public.activity_participants where activity_id=$1 and user_id=$2', [act, C])
  p = await db.query('select user_id from public.activity_participants where activity_id=$1', [act])
  assert(!p.rows.some((r) => r.user_id === C), 'participant could not leave')
})
await test("only the organizer can edit or cancel", async () => {
  await as(B, `update public.activities set status='cancelled' where id=$1`, [act])
  let r = await db.query('select status from public.activities where id=$1', [act])
  assert(r.rows[0].status === 'open', 'non-organizer cancelled')
  await as(A, `update public.activities set status='cancelled' where id=$1`, [act])
  r = await db.query('select status from public.activities where id=$1', [act])
  assert(r.rows[0].status === 'cancelled', 'organizer could not cancel')
  await rejects(as(B, 'insert into public.activity_participants (activity_id, user_id) values ($1, $2)', [act, B]), 'activity_not_open')
})

console.log('\nFeed, reports & moderation')
let post
await test('members post, comment and react; post author is notified', async () => {
  post = (await as(A, `insert into public.posts (author_id, body) values ($1, 'Primer día en la comunidad 💙') returning id`, [A]))[0].id
  await as(B, `insert into public.comments (post_id, author_id, body) values ($1, $2, '¡Bienvenido!')`, [post, B])
  await as(B, `insert into public.reactions (post_id, user_id, kind) values ($1, $2, 'heart')`, [post, B])
  await as(B, `insert into public.reactions (post_id, user_id, kind) values ($1, $2, 'hug') on conflict (post_id, user_id) do update set kind = excluded.kind`, [post, B])
  const r = await db.query('select kind from public.reactions')
  assert(r.rows.length === 1 && r.rows[0].kind === 'hug', 'reaction not updated')
  const n = await as(A, `select 1 from public.notifications where type='post_comment'`)
  assert(n.length === 1, 'no comment notification')
})
await test('cannot set moderation status on own post', async () => {
  await rejects(as(A, `update public.posts set moderation_status='visible' where id=$1`, [post]), 'permission denied')
})
await test('cannot report a message from a conversation you are not in', async () => {
  const msg = (await db.query('select id from public.messages limit 1')).rows[0].id
  await rejects(as(M, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'message', $2, 'spam')`, [M, msg]), 'report_target_not_found')
})
await test('3 reports auto-hide a post; reporters see only their own reports', async () => {
  for (const u of [B, C, M]) await as(u, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'spam')`, [u, post])
  const r = await db.query('select moderation_status from public.posts where id=$1', [post])
  assert(r.rows[0].moderation_status === 'hidden', 'not hidden')
  const visibleToB = await as(B, 'select id from public.posts')
  assert(visibleToB.length === 0, 'hidden post visible')
  const ownReports = await as(B, 'select * from public.reports')
  assert(ownReports.length === 1, `saw ${ownReports.length} reports`)
})
await test('non-moderators cannot moderate', async () => {
  const rep = (await db.query('select id from public.reports limit 1')).rows[0].id
  await rejects(as(B, `select public.moderate_report($1, 'restore')`, [rep]), 'not_allowed')
  await rejects(as(B, `update public.reports set status='dismissed'`), 'permission denied')
})
await test('moderator restores the post and resolves all its reports', async () => {
  await db.query('update public.profiles set is_moderator=true where id=$1', [M])
  const rep = (await db.query('select id from public.reports limit 1')).rows[0].id
  const preview = await as(M, 'select public.report_target_preview($1) p', [rep])
  assert(preview[0].p.text.includes('Primer día'), 'no preview')
  await as(M, `select public.moderate_report($1, 'restore', 'falsa alarma')`, [rep])
  const r = await db.query(`select count(*)::int n from public.reports where status='dismissed'`)
  const p = await db.query('select moderation_status from public.posts where id=$1', [post])
  assert(r.rows[0].n === 3 && p.rows[0].moderation_status === 'visible', 'not resolved')
})

console.log('\nBlocking')
await test('blocking hides profiles/posts both ways, removes connection and stops messages', async () => {
  await as(B, 'insert into public.blocked_users (blocker_id, blocked_id) values ($1, $2)', [B, A])
  const seesB = await as(A, 'select id from public.profiles where id=$1', [B])
  const seesA = await as(B, 'select id from public.profiles where id=$1', [A])
  assert(seesB.length === 0 && seesA.length === 0, 'profiles still visible')
  const posts = await as(B, 'select id from public.posts')
  assert(posts.length === 0, 'blocked user posts visible')
  const c = await db.query('select * from public.connections')
  assert(c.rows.length === 0, 'connection not removed')
  await rejects(as(A, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hey')`, [conv, A]), 'row-level security')
  await rejects(as(A, 'select public.start_direct_conversation($1)', [B]), 'user_not_found')
})
await test('the blocked user cannot see who blocked them', async () => {
  const rows = await as(A, 'select * from public.blocked_users')
  assert(rows.length === 0, 'block list leaked')
  const viaRpc = await as(A, 'select * from public.my_blocked_users()')
  assert(viaRpc.length === 0, 'block list leaked via rpc')
})
await test('blocker can list (and unblock) the people they blocked', async () => {
  const rows = await as(B, 'select username from public.my_blocked_users()')
  assert(rows.length === 1 && rows[0].username === 'alex', JSON.stringify(rows))
})
await test('username_available works and rejects invalid names', async () => {
  const [taken] = await as(C, `select public.username_available('bea') ok`)
  const [free] = await as(C, `select public.username_available('nueva_persona') ok`)
  const [bad] = await as(C, `select public.username_available('A!') ok`)
  assert(!taken.ok && free.ok && !bad.ok, JSON.stringify({ taken, free, bad }))
})
await test('suspended users lose member access', async () => {
  await as(M, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'user', $2, 'harassment')`, [M, C])
  const rep = (await db.query(`select id from public.reports where target_type='user'`)).rows[0].id
  await as(M, `select public.moderate_report($1, 'suspend_user')`, [rep])
  const rows = await as(C, 'select id from public.profiles')
  assert(rows.length === 1, 'suspended user still sees members')
  const others = await as(M, `select id from public.discover_people()`)
  assert(!others.some((r) => r.id === C), 'suspended user discoverable')
})

console.log('\nStorage')
await test('avatars: write only to own folder', async () => {
  await as(A, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${A}/avatar.webp`])
  await rejects(as(A, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${B}/avatar.webp`]), 'row-level security')
})
await test('avatars: members can read, non-members only their own', async () => {
  const m = await as(M, `select name from storage.objects where bucket_id='avatars'`)
  assert(m.length === 1, 'member cannot read')
  const u = await as(U, `select name from storage.objects where bucket_id='avatars'`)
  assert(u.length === 0, 'non-member can read')
})

console.log('\nGroup chats')
let grp
const sendTo = (id, convId, body) =>
  as(id, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)`, [convId, id, body])
await test('members see the group directory; non-members see nothing', async () => {
  const rows = await as(A, 'select * from public.list_groups()')
  assert(rows.length === 10 && rows.every((r) => !r.joined && r.last_message_body === null), JSON.stringify(rows[0]))
  grp = rows.find((r) => r.title === 'Charla general').id
  const u = await as(U, 'select * from public.list_groups()')
  assert(u.length === 0, 'non-member saw groups')
  await rejects(as(U, 'insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)', [grp, U]), 'row-level security')
})
await test('join a group yourself; cannot add others or join a private chat', async () => {
  await as(A, 'insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)', [grp, A])
  await rejects(as(A, 'insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)', [grp, M]), 'row-level security')
  await rejects(as(M, 'insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)', [conv, M]), 'row-level security')
})
await test('only people inside a group can read it (no previews outside)', async () => {
  await sendTo(A, grp, 'Hola grupo')
  const outside = await as(M, 'select * from public.messages where conversation_id = $1', [grp])
  assert(outside.length === 0, 'outsider read group messages')
  const [g] = await as(M, 'select * from public.list_groups() where id = $1', [grp])
  assert(Number(g.member_count) === 1 && g.last_message_body === null && !g.joined, JSON.stringify(g))
  await rejects(sendTo(M, grp, 'colado'), 'row-level security')
})
await test('after joining: read history, unread count, send', async () => {
  await as(M, 'insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)', [grp, M])
  // joined_at/last_read_at default to now(), so backdate to count the earlier message as unread
  await db.query(`update public.conversation_participants set last_read_at = now() - interval '1 hour' where conversation_id = $1 and user_id = $2`, [grp, M])
  const msgs = await as(M, 'select body from public.messages where conversation_id = $1', [grp])
  assert(msgs.length === 1, 'cannot read history')
  const [g] = await as(M, 'select * from public.list_groups() where id = $1', [grp])
  assert(g.joined && Number(g.unread_count) === 1 && g.last_message_body === 'Hola grupo', JSON.stringify(g))
  await sendTo(M, grp, 'Bienvenidos')
})
await test('in a group, a block hides messages both ways but does not silence anyone', async () => {
  // B blocked A earlier
  await as(B, 'insert into public.conversation_participants (conversation_id, user_id) values ($1, $2)', [grp, B])
  const bSees = await as(B, 'select body from public.messages where conversation_id = $1 order by created_at', [grp])
  assert(bSees.map((m) => m.body).join() === 'Bienvenidos', JSON.stringify(bSees))
  await sendTo(B, grp, 'Hola, soy Bea')
  await sendTo(A, grp, 'Sigo pudiendo escribir')
  const aSees = await as(A, 'select body from public.messages where conversation_id = $1', [grp])
  assert(!aSees.some((m) => m.body === 'Hola, soy Bea'), 'blocked message visible')
  const mSees = await as(M, 'select body from public.messages where conversation_id = $1', [grp])
  assert(mSees.length === 4, `third party should see all 4, saw ${mSees.length}`)
})
await test('direct inbox ignores groups; private chats cannot be "left"', async () => {
  const inbox = await as(M, 'select * from public.my_conversations()')
  assert(!inbox.some((r) => r.conversation_id === grp), 'group in direct inbox')
  await as(A, 'delete from public.conversation_participants where conversation_id = $1 and user_id = $2', [conv, A])
  const still = await db.query('select 1 from public.conversation_participants where conversation_id = $1 and user_id = $2', [conv, A])
  assert(still.rows.length === 1, 'left a direct chat')
})
await test('leaving a group removes access', async () => {
  await as(A, 'delete from public.conversation_participants where conversation_id = $1 and user_id = $2', [grp, A])
  const rows = await as(A, 'select * from public.messages where conversation_id = $1', [grp])
  assert(rows.length === 0, 'still reads after leaving')
  await rejects(sendTo(A, grp, 'sigo aquí?'), 'row-level security')
})
await test('clients cannot create or rename groups', async () => {
  await rejects(as(M, `insert into public.conversations (kind, title) values ('group', 'Mi grupo')`), 'permission denied')
  await rejects(as(M, `update public.conversations set title = 'hackeado' where id = $1`, [grp]), 'permission denied')
})

console.log('\nAccount deletion')
await test('deleting an auth user cascades through all their data', async () => {
  await db.query('delete from auth.users where id=$1', [A])
  for (const t of ['profiles', 'posts', 'activities', 'messages', 'user_interests', 'notifications']) {
    const col = { profiles: 'id', posts: 'author_id', activities: 'organizer_id', messages: 'sender_id', user_interests: 'user_id', notifications: 'user_id' }[t]
    const r = await db.query(`select count(*)::int n from public.${t} where ${col}=$1`, [A])
    assert(r.rows[0].n === 0, `${t} not cleaned`)
  }
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
