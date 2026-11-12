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

console.log('\nStatistics')
await test('activity is recorded for members only and nobody can read it directly', async () => {
  for (const u of [A, B, M, U]) await as(u, 'select public.touch_activity()')
  await as(A, 'select public.touch_activity()') // second call within the hour is a no-op
  const r = await db.query('select user_id from public.user_activity')
  assert(r.rows.length === 3 && !r.rows.some((x) => x.user_id === U), JSON.stringify(r.rows))
  await rejects(as(M, 'select * from public.user_activity'), 'permission denied')
})
await test('only moderators can read statistics', async () => {
  await rejects(as(A, 'select public.admin_stats()'), 'not_allowed')
  await rejects(as(null, 'select public.admin_stats()'), 'permission denied')
})
await test('statistics add up', async () => {
  const [{ s }] = await as(M, 'select public.admin_stats() s')
  const users = (await db.query('select count(*)::int n from auth.users')).rows[0].n
  assert(Number(s.funnel.registered) === users, `registered ${s.funnel.registered} vs ${users}`)
  assert(Number(s.funnel.suspended) === 1, 'suspended count')
  assert(Number(s.active.d1) === 3, `active d1 ${s.active.d1}`)
  assert(s.new_members_daily.length === 30, 'daily series not zero-filled to 30 days')
  const madrid = s.top_cities.find((c) => c.city === 'Madrid')
  assert(madrid && Number(madrid.count) === 2, JSON.stringify(s.top_cities)) // alex + bea (unverified/suspended excluded)
  assert(s.groups.length === 10 && Number(s.content.messages_30d) > 0, 'groups/content missing')
  assert(!JSON.stringify(s).includes('Primer día'), 'stats leaked content')
})

console.log('\nMedia (photos, voice notes, stickers)')
const upload = (id, name) => as(id, `insert into storage.objects (bucket_id, name) values ('media', $1)`, [name])
const listMedia = (id) => as(id, `select name from storage.objects where bucket_id = 'media' order by name`)
const msg = (id, convId, fields) =>
  as(id, `insert into public.messages (conversation_id, sender_id, kind, body, media_path) values ($1, $2, $3, $4, $5)`, [
    convId, id, fields.kind, fields.body ?? null, fields.media_path ?? null,
  ])
await test('chat uploads: only into your own folder of a conversation you are in', async () => {
  await upload(B, `chat/${grp}/${B}/photo.webp`)
  await rejects(upload(B, `chat/${grp}/${M}/photo.webp`), 'row-level security')
  await rejects(upload(A, `chat/${grp}/${A}/photo.webp`), 'row-level security') // A left the group
  await rejects(upload(U, `chat/${grp}/${U}/photo.webp`), 'row-level security')
  await rejects(upload(B, `chat/not-a-uuid/${B}/x.webp`), 'row-level security')
})
await test('post uploads: own folder only', async () => {
  await upload(A, `posts/${A}/p.webp`)
  await rejects(upload(A, `posts/${B}/p.webp`), 'row-level security')
})
await test('chat media readable by participants only; post media by members', async () => {
  const a = (await listMedia(A)).map((r) => r.name)
  assert(a.includes(`posts/${A}/p.webp`) && !a.some((n) => n.startsWith('chat/')), JSON.stringify(a))
  const b = (await listMedia(B)).map((r) => r.name)
  assert(b.includes(`chat/${grp}/${B}/photo.webp`), 'participant cannot read chat media')
  const u = await listMedia(U)
  assert(u.length === 0, 'non-member read media')
})
await test('moderators can read all media (to review reports)', async () => {
  const [{ n }] = await as(M, `select count(*)::int n from storage.objects where bucket_id = 'media'`)
  assert(n === 2, `moderator saw ${n}`)
})
await test('image, audio and sticker messages validate their content', async () => {
  await msg(B, grp, { kind: 'image', media_path: `chat/${grp}/${B}/photo.webp`, body: 'Mi desayuno' })
  await msg(B, grp, { kind: 'audio', media_path: `chat/${grp}/${B}/a.mp4` })
  await msg(B, grp, { kind: 'sticker', body: 'juice' })
  await rejects(msg(B, grp, { kind: 'image', media_path: `chat/${grp}/${M}/photo.webp` }), 'messages_media_own_folder')
  await rejects(msg(B, grp, { kind: 'text', body: null }), 'messages_content')
  await rejects(msg(B, grp, { kind: 'text', body: 'hola', media_path: `chat/${grp}/${B}/x.webp` }), 'messages_content')
  await rejects(msg(B, grp, { kind: 'sticker', body: '<script>' }), 'messages_content')
  await rejects(msg(B, grp, { kind: 'audio', media_path: `chat/${grp}/${B}/a.mp4`, body: 'x' }), 'messages_content')
})
await test('group list previews media messages', async () => {
  const [g] = await as(M, 'select last_message_body from public.list_groups() where id = $1', [grp])
  assert(g.last_message_body === '✨ Sticker', JSON.stringify(g))
})
await test('posts: photo-only allowed; empty posts and foreign photos rejected', async () => {
  await as(A, `insert into public.posts (author_id, image_path) values ($1, $2)`, [A, `posts/${A}/p.webp`])
  await rejects(as(A, `insert into public.posts (author_id, body) values ($1, '   ')`, [A]), 'posts_content')
  await rejects(as(A, `insert into public.posts (author_id, image_path) values ($1, $2)`, [A, `posts/${B}/p.webp`]), 'posts_image_own_folder')
})

console.log('\nLaunch hardening')
await test('you can delete your own messages, not anyone else\'s', async () => {
  const [{ id }] = await as(B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'me equivoqué') returning id`, [grp, B])
  await rejects(as(M, 'select public.delete_my_message($1)', [id]), 'not_allowed')
  await as(B, 'select public.delete_my_message($1)', [id])
  const [row] = (await db.query('select body, deleted_at from public.messages where id = $1', [id])).rows
  assert(row.body === null && row.deleted_at, 'not deleted')
  const [g] = await as(M, 'select last_message_body from public.list_groups() where id = $1', [grp])
  assert(g.last_message_body === '🚫 Mensaje eliminado', JSON.stringify(g))
})
await test('deleting a reported message keeps a copy for moderators only', async () => {
  const [{ id }] = await as(B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'insulto') returning id`, [grp, B])
  await as(M, `insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'message', $2, 'harassment')`, [M, id])
  const kept = await as(B, 'select public.delete_my_message($1) p', [id])
  assert(kept[0].p === null, 'media path returned for a reported message')
  await rejects(as(B, 'select * from public.deleted_message_archive'), 'permission denied')
  const rep = (await db.query(`select id from public.reports where target_id = $1`, [id])).rows[0].id
  const [{ p }] = await as(M, 'select public.report_target_preview($1) p', [rep])
  assert(p.text.includes('insulto') && p.text.includes('Borrado por su autor'), JSON.stringify(p))
})
await test('messages are rate limited', async () => {
  await rejects(
    (async () => {
      for (let i = 0; i < 35; i++) await as(M, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3)`, [grp, M, `spam ${i}`])
    })(),
    'rate_limited',
  )
})
await test('plan capacity cannot drop below attendees', async () => {
  const [{ id }] = await as(M, `insert into public.activities (organizer_id, title, starts_at, country, city, max_participants)
    values ($1, 'Ruta', now() + interval '2 days', 'ES', 'Sevilla', 5) returning id`, [M])
  await as(B, 'insert into public.activity_participants (activity_id, user_id) values ($1, $2)', [id, B])
  await rejects(as(M, 'update public.activities set max_participants = 1 where id = $1', [id]), 'activity_capacity_below_attendees')
  await as(M, `update public.activities set max_participants = 2, title = 'Ruta corta' where id = $1`, [id])
})
await test('only moderators can pin posts', async () => {
  const [{ id }] = await as(B, `insert into public.posts (author_id, body) values ($1, 'Anuncio') returning id`, [B])
  await rejects(as(B, 'select public.set_post_pinned($1, true)', [id]), 'not_allowed')
  await rejects(as(B, 'update public.posts set pinned_at = now() where id = $1', [id]), 'permission denied')
  await as(M, 'select public.set_post_pinned($1, true)', [id])
  const [row] = (await db.query('select pinned_at from public.posts where id = $1', [id])).rows
  assert(row.pinned_at, 'not pinned')
})

console.log('\nLaunch controls')
await test('sign-up mode is readable by anyone, defaults to open, settings stay private', async () => {
  const [{ m }] = await as(null, 'select public.signup_mode() m')
  assert(m === 'open', `mode ${m}`)
  await rejects(as(A, 'select * from public.app_settings'), 'permission denied')
  await rejects(as(A, 'select * from public.invite_codes'), 'permission denied')
  await rejects(as(A, `update public.app_settings set value = 'closed'`), 'permission denied')
})
await test('invite mode needs a valid, unused, unexpired code; only moderators generate codes', async () => {
  await rejects(as(A, 'select * from public.generate_invite_codes(1)'), 'not_allowed')
  await rejects(as(null, 'select * from public.generate_invite_codes(1)'), 'permission denied')
  const codes = (await as(M, `select * from public.generate_invite_codes(2, 1, 'embajadores', 7)`)).map((r) => r.generate_invite_codes)
  assert(codes.length === 2 && codes.every((c) => /^T1-[A-F0-9]{8}$/.test(c)), JSON.stringify(codes))
  const listed = await as(M, 'select * from public.list_invite_codes()')
  assert(listed.length === 2 && listed[0].uses === 0, JSON.stringify(listed))
  await rejects(as(A, 'select * from public.list_invite_codes()'), 'not_allowed')

  await db.query(`update public.app_settings set value = 'invite' where key = 'signup_mode'`)
  const [{ ok: good }] = await as(null, 'select public.check_invite_code($1) ok', [codes[0].toLowerCase()])
  const [{ ok: bad }] = await as(null, 'select public.check_invite_code($1) ok', ['NOPE-NOPE'])
  assert(good && !bad, 'check_invite_code')

  await rejects(createUser('i0@test.dev'), 'invalid_invite')
  await rejects(createUser('i1@test.dev', { meta: { ...consent, invite_code: 'T1-DEADBEEF' } }), 'invalid_invite')
  const id = await createUser('i2@test.dev', { meta: { ...consent, invite_code: codes[0].toLowerCase() } })
  const red = (await db.query('select code from public.invite_redemptions where user_id = $1', [id])).rows
  assert(red.length === 1 && red[0].code === codes[0], 'redemption not recorded')
  await rejects(createUser('i3@test.dev', { meta: { ...consent, invite_code: codes[0] } }), 'invalid_invite') // single use

  await db.query(`insert into public.invite_codes (code, max_uses, expires_at) values ('T1-EXPIRED1', 5, now() - interval '1 day')`)
  await rejects(createUser('i4@test.dev', { meta: { ...consent, invite_code: 'T1-EXPIRED1' } }), 'invalid_invite')

  await db.query(`update public.app_settings set value = 'closed' where key = 'signup_mode'`)
  await rejects(createUser('i5@test.dev', { meta: { ...consent, invite_code: codes[1] } }), 'signups_closed')

  await db.query(`update public.app_settings set value = 'open' where key = 'signup_mode'`)
  await createUser('i6@test.dev') // open again: no code needed
  await rejects(db.query(`update public.app_settings set value = 'whatever' where key = 'signup_mode'`), 'app_settings_signup_mode')
})
await test('moderators can pick a custom code; it also counts while sign-up is open', async () => {
  await rejects(as(A, `select public.create_invite_code('CARLOS')`), 'not_allowed')
  await rejects(as(null, `select public.create_invite_code('CARLOS')`), 'permission denied')
  await rejects(as(M, `select public.create_invite_code('no vale!')`), 'invalid_code')
  await rejects(as(M, `select public.create_invite_code('AB')`), 'invalid_code')
  const [{ c }] = await as(M, `select public.create_invite_code(' carlos ', 2, 'Influencer Carlos') c`)
  assert(c === 'CARLOS', `code ${c}`)
  await rejects(as(M, `select public.create_invite_code('Carlos')`), 'code_taken')

  // Open mode: no code is fine, a valid code is counted, a wrong one is refused.
  const plain = await createUser('o1@test.dev')
  const none = (await db.query('select 1 from public.invite_redemptions where user_id = $1', [plain])).rows
  assert(none.length === 0, 'redemption without code')
  const id = await createUser('o2@test.dev', { meta: { ...consent, invite_code: 'carlos' } })
  const red = (await db.query('select code from public.invite_redemptions where user_id = $1', [id])).rows
  assert(red.length === 1 && red[0].code === 'CARLOS', 'open-mode redemption not recorded')
  await rejects(createUser('o3@test.dev', { meta: { ...consent, invite_code: 'NOEXISTE' } }), 'invalid_invite')
  await createUser('o4@test.dev', { meta: { ...consent, invite_code: 'CARLOS' } })
  await rejects(createUser('o5@test.dev', { meta: { ...consent, invite_code: 'CARLOS' } }), 'invalid_invite') // 2 uses max
  const [{ uses }] = (await db.query(`select uses from public.invite_codes where code = 'CARLOS'`)).rows
  assert(uses === 2, `uses ${uses}`)
})
await test('moderators can edit, pause and delete codes', async () => {
  await as(M, `select public.create_invite_code('ANA', 10, 'Instagram de Ana')`)
  await rejects(as(A, `select public.update_invite_code('ANA', 5, null, null, true)`), 'not_allowed')
  await rejects(as(A, `select public.delete_invite_code('ANA')`), 'not_allowed')
  await rejects(as(null, `select public.delete_invite_code('ANA')`), 'permission denied')

  await createUser('e1@test.dev', { meta: { ...consent, invite_code: 'ANA' } })
  await rejects(as(M, `select public.update_invite_code('ANA', 0, null, null, true)`), 'invalid_code')
  await as(M, `select public.update_invite_code('ana', 50, 'Ana · TikTok', null, true)`)
  let [row] = (await as(M, `select * from public.list_invite_codes() where code = 'ANA'`))
  assert(row.max_uses === 50 && row.note === 'Ana · TikTok' && row.uses === 1 && row.disabled_at === null, JSON.stringify(row))

  // Paused: refused at sign-up and by the pre-check; resuming works again.
  await as(M, `select public.update_invite_code('ANA', 50, 'Ana · TikTok', null, false)`)
  const [{ ok }] = await as(null, `select public.check_invite_code('ANA') ok`)
  assert(!ok, 'paused code still valid')
  await rejects(createUser('e2@test.dev', { meta: { ...consent, invite_code: 'ANA' } }), 'invalid_invite')
  await as(M, `select public.update_invite_code('ANA', 50, null, null, true)`)
  await createUser('e3@test.dev', { meta: { ...consent, invite_code: 'ANA' } })
  await rejects(as(M, `select public.update_invite_code('ANA', 1, null, null, true)`), 'max_below_uses')

  // Delete: the code and its sign-up records go, the accounts stay.
  const before = (await db.query('select count(*)::int n from public.profiles')).rows[0].n
  await as(M, `select public.delete_invite_code('ANA')`)
  const left = (await db.query(`select count(*)::int n from public.invite_redemptions where code = 'ANA'`)).rows[0].n
  const after = (await db.query('select count(*)::int n from public.profiles')).rows[0].n
  assert(left === 0 && before === after, `redemptions ${left}, profiles ${before}->${after}`)
  await rejects(as(M, `select public.delete_invite_code('ANA')`), 'invite_not_found')
})
console.log('\nCreator communities')
let comm
await test('only moderators create communities; the host is inside both channels', async () => {
  await rejects(as(A, `select public.save_community(null, 'carlos', 'La tribu de Carlos', null, '🔥', 'bea')`), 'not_allowed')
  await rejects(as(M, `select public.save_community(null, 'Mal Slug!', 'La tribu', null, null, null)`), 'invalid_community')
  await rejects(as(M, `select public.save_community(null, 'carlos', 'La tribu de Carlos', null, null, 'nadie')`), 'host_not_found')
  const [{ s }] = await as(M, `select public.save_community(null, 'carlos', 'La tribu de Carlos', 'Mi gente', '🔥', '@Bea') s`)
  assert(s === 'carlos', s)
  await rejects(as(M, `select public.save_community(null, 'carlos', 'Otra', null, null, null)`), 'slug_taken')
  ;[comm] = await as(B, `select * from public.list_communities() where slug = 'carlos'`)
  assert(comm.joined && comm.host_id === B && Number(comm.member_count) === 1, JSON.stringify(comm))
  // Community channels never show up among the topic groups.
  const groups = await as(A, 'select title from public.list_groups()')
  assert(!groups.some((g) => g.title === 'Avisos' || g.title === 'Charla'), 'channels leaked into groups')
  const none = await as(U, 'select * from public.list_communities()')
  assert(none.length === 0, 'non-member saw communities')
})
await test('only the host and moderators post announcements; everyone talks in the chat', async () => {
  await db.query(`update public.messages set created_at = created_at - interval '1 day'`) // clear the anti-spam window
  await as(A, 'select public.join_community($1)', [comm.id])
  await as(B, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Bienvenidos a mi comunidad')`, [comm.announcements_id, B])
  await rejects(as(A, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'yo también')`, [comm.announcements_id, A]), 'row-level security')
  await as(A, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hola a todos')`, [comm.chat_id, A])
  await as(M, 'select public.join_community($1)', [comm.id])
  await as(M, `insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Aviso del equipo')`, [comm.announcements_id, M])
  const [c] = await as(A, `select * from public.list_communities() where id = $1`, [comm.id])
  assert(c.joined && Number(c.member_count) === 3 && c.last_announcement_body === 'Aviso del equipo', JSON.stringify(c))
  // Outsiders see the latest announcement (a broadcast) but not the chat.
  const D = await createUser('outsider@test.dev')
  await onboard(D, 'dani', 'Sevilla', ['music'])
  const [o] = await as(D, `select * from public.list_communities() where id = $1`, [comm.id])
  assert(o && !o.joined && o.last_announcement_body === 'Aviso del equipo' && o.last_chat_body === null, JSON.stringify(o))
  const chat = await as(D, 'select * from public.messages where conversation_id = $1', [comm.chat_id])
  assert(chat.length === 0, 'outsider read the chat')
})
await test('members leave as a unit; the host cannot leave their own community', async () => {
  await as(A, 'select public.leave_community($1)', [comm.id])
  const left = await db.query('select 1 from public.conversation_participants p join public.conversations c on c.id = p.conversation_id where c.community_id = $1 and p.user_id = $2', [comm.id, A])
  assert(left.rows.length === 0, 'still inside a channel')
  await rejects(as(B, 'select public.leave_community($1)', [comm.id]), 'host_cannot_leave')
})
await test('signing up with a code linked to a community joins it', async () => {
  await as(M, `select public.create_invite_code('TRIBUCARLOS', 100, 'Carlos', null, $1)`, [comm.id])
  const [{ n }] = await as(null, `select public.invite_code_community('tribucarlos') n`)
  assert(n === 'La tribu de Carlos', n)
  const id = await createUser('fan@test.dev', { meta: { ...consent, invite_code: 'tribucarlos' } })
  const rows = await db.query('select c.channel from public.conversation_participants p join public.conversations c on c.id = p.conversation_id where c.community_id = $1 and p.user_id = $2', [comm.id, id])
  assert(rows.rows.length === 2, `joined ${rows.rows.length} channels`)
  const [code] = await as(M, `select * from public.list_invite_codes() where code = 'TRIBUCARLOS'`)
  assert(code.community_name === 'La tribu de Carlos', JSON.stringify(code))
  await as(M, `select public.update_invite_code('TRIBUCARLOS', 100, null, null, true, null)`)
  const [{ n: none }] = await as(null, `select public.invite_code_community('TRIBUCARLOS') n`)
  assert(none === null, 'unlinked code still points at the community')
})
await test('moderators edit and delete communities', async () => {
  await rejects(as(A, 'select public.delete_community($1)', [comm.id]), 'not_allowed')
  await as(M, `select public.save_community($1, 'carlos-t1', 'La tribu de Carlos', 'Nueva descripción', '💙', 'bea')`, [comm.id])
  const [c] = await as(A, `select * from public.list_communities() where id = $1`, [comm.id])
  assert(c.slug === 'carlos-t1' && c.description === 'Nueva descripción', JSON.stringify(c))
  await as(M, 'select public.delete_community($1)', [comm.id])
  const gone = await db.query('select 1 from public.conversations where community_id = $1', [comm.id])
  assert(gone.rows.length === 0, 'channels survived')
})
await test('only moderators can flip the sign-up switch from the app', async () => {
  await rejects(as(A, `select public.set_signup_mode('closed')`), 'not_allowed')
  await rejects(as(null, `select public.set_signup_mode('closed')`), 'permission denied')
  await rejects(as(M, `select public.set_signup_mode('everything')`), 'invalid_action')
  await as(M, `select public.set_signup_mode('invite')`)
  const [{ m }] = await as(null, 'select public.signup_mode() m')
  assert(m === 'invite', `mode ${m}`)
  await as(M, `select public.set_signup_mode('open')`)
  const [{ m: back }] = await as(null, 'select public.signup_mode() m')
  assert(back === 'open', `mode ${back}`)
})
await test('new report reasons are accepted', async () => {
  const targets = { illegal_sale: M, scam: A, self_harm: U }
  for (const [reason, target] of Object.entries(targets)) {
    await db.query(`insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'user', $2, $3)`, [B, target, reason])
  }
  const r = await db.query(`select count(*)::int n from public.reports where reporter_id = $1 and reason in ('illegal_sale', 'scam', 'self_harm')`, [B])
  assert(r.rows[0].n === 3, `reports ${r.rows[0].n}`)
})
await test('authors are told once when reports hide their content', async () => {
  const [{ id }] = await as(B, `insert into public.posts (author_id, body) values ($1, 'Contenido discutido') returning id`, [B])
  for (const reporter of [A, M, C, U]) {
    await db.query(`insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'post', $2, 'other')`, [reporter, id])
  }
  const p = await db.query('select moderation_status from public.posts where id = $1', [id])
  assert(p.rows[0].moderation_status === 'hidden', 'post not hidden')
  const n = await as(B, `select entity_id from public.notifications where type = 'content_hidden'`)
  assert(n.length === 1 && n[0].entity_id === id, `notifications: ${JSON.stringify(n)}`)
})
await test('members can hide themselves from Discover and search', async () => {
  await as(B, 'update public.profiles set discoverable = false where id = $1', [B])
  const hidden = await as(M, 'select username from public.discover_people()')
  assert(!hidden.some((r) => r.username === 'bea'), 'hidden member still listed')
  const searched = await as(M, `select username from public.discover_people(p_query => 'bea')`)
  assert(searched.length === 0, 'hidden member found by search')
  await as(B, 'update public.profiles set discoverable = true where id = $1', [B])
  const back = await as(M, 'select username from public.discover_people()')
  assert(back.some((r) => r.username === 'bea'), 'member did not come back')
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
