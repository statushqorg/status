/**
 * The account you sign in with locally, and the production owner bootstrap.
 *
 *   ./buddy seed --only-seeders OwnerSeeder --skip-models
 *
 * ## Why this file has to exist
 *
 * Model-factory seeding will not produce a usable sign-in, by design and in
 * two separate ways.
 *
 * `User` is on @stacksjs/database's ACCOUNT_MODELS list, so a factory run
 * leaves foreign keys that point at a user null rather than inventing an
 * owner. The framework's own note on that list says which account owns a
 * seeded row is "a decision for the app that seeded it (a `demo:account`
 * command, a fixture, a migration), not something a factory should guess".
 * This file is that decision for Status.
 *
 * Separately, `app/Models/User.ts` does carry `useSeeder: { count: 10 }`, so
 * `./buddy seed` writes ten users -- with `factory: faker => faker.internet
 * .email()` addresses and the password `123456`. Ten accounts that cannot be
 * signed in to, because nobody knows the addresses. Before this seeder there
 * was no known credential anywhere in the app, and every local verification
 * of an `@if (AUTH_USER)` page started by hand-writing rows into
 * database/stacks.sqlite.
 *
 * ## What a run guarantees
 *
 * A user, a team, and an owner membership joining them -- created if absent,
 * left alone if present, so the seeder is safe to re-run and safe to run on a
 * database that already has real rows in it. Verified end to end against
 * `./buddy dev`: `POST /login` answers 200 with an `auth-token` cookie.
 *
 * Use `./buddy dev`, not `./buddy serve`, when checking that by hand. `dev`
 * serves the site and the API together on :3000 and routes `/login`; `serve`
 * needs `PORT_API` pointed at a separately running API and refuses to proxy
 * `/login` without it, which surfaces in the browser as the thoroughly
 * misleading "Incorrect email or password".
 *
 * ## Credentials
 *
 * `STATUS_OWNER_EMAIL` / `STATUS_OWNER_PASSWORD` when set. A local
 * environment falls back to the constants below so that a fresh clone can
 * sign in after one `./buddy seed` with nothing to configure; every other
 * environment must supply the password, and production refuses to run
 * without both. The fallback is keyed on an explicit allowlist of APP_ENV
 * values rather than "not production", so a staging deploy that forgets to
 * set them gets the skip and not a published default password.
 */
import { db, Seeder } from '@stacksjs/database'
import { env } from '@stacksjs/env'
import { log } from '@stacksjs/logging'
import { makeHash, verifyHash } from '@stacksjs/security'

/**
 * The local fallback. `.localhost` is reserved by RFC 6761 and resolves
 * nowhere but this machine, so the address cannot be mistaken for a real
 * mailbox or receive a stray notification.
 */
const DEV_EMAIL = 'owner@status.localhost'
const DEV_PASSWORD = 'stacks-dev-only'
const DEV_NAME = 'Status Owner'
const WORKSPACE = 'Status'

/**
 * APP_ENV values that may use the fallback credentials above.
 *
 * `dev` is in here deliberately: config/env.ts types APP_ENV as the enum
 * local|dev|stage|prod, so `dev` is a value this app really takes even though
 * the committed .env says `development`. Without it the seeder would silently
 * skip on a correctly-configured machine and report success while writing
 * nothing. `stage` is deliberately NOT here -- it falls through to the
 * "supply the password" branch, which is the point of listing the local
 * values explicitly instead of testing for "not production".
 */
const LOCAL_ENVS = new Set(['development', 'dev', 'local', 'test', 'testing'])
const PRODUCTION_ENVS = new Set(['prod', 'production'])

interface IdentifiedRow {
  id: number
}

/**
 * The id of one row, or undefined.
 *
 * Number(): a Postgres bigint id arrives as a string, and an id that stays a
 * string flows into the team_members insert below as a foreign key the
 * dialect then rejects. The same shape bit the hand-written version of this
 * seeder on SQLite, where a bad insert id came back NaN and wrote NULL
 * foreign keys that looked like a successful run.
 */
async function findId(table: string, column: string, value: string): Promise<number | undefined> {
  const row = await db.selectFrom(table as any)
    .select(['id'] as any)
    .where(column as any, '=', value)
    .executeTakeFirst() as IdentifiedRow | undefined

  return row?.id === undefined ? undefined : Number(row.id)
}

/**
 * Whether `password` is the one behind `stored`.
 *
 * verifyHash THROWS rather than returning false when `stored` is not a hash
 * it can parse -- `Password verification failed with error "InvalidEncoding"`
 * -- and a row whose password column holds something unparseable is precisely
 * the case the caller is trying to repair. Letting that escape turned a
 * recoverable row into a failed seed run.
 */
async function passwordMatches(password: string, stored: unknown): Promise<boolean> {
  if (typeof stored !== 'string' || stored.length === 0)
    return false

  try {
    return await verifyHash(password, stored)
  }
  catch {
    return false
  }
}

export default class OwnerSeeder extends Seeder {
  static override tags = ['owner'] as const

  async run(): Promise<void> {
    const appEnv = String(env.APP_ENV || '').toLowerCase()
    const isLocal = LOCAL_ENVS.has(appEnv)
    const isProduction = PRODUCTION_ENVS.has(appEnv)

    const envEmail = String(env.STATUS_OWNER_EMAIL || '').trim().toLowerCase()
    const envPassword = String(env.STATUS_OWNER_PASSWORD || '')

    if (isProduction && (!envEmail || !envPassword))
      throw new Error('STATUS_OWNER_EMAIL and STATUS_OWNER_PASSWORD are both required for the production owner bootstrap.')

    if (!envPassword && !isLocal) {
      log.info(`[OwnerSeeder] Skipped: STATUS_OWNER_PASSWORD is not set and APP_ENV="${appEnv}" is not a local environment.`)
      return
    }

    const email = envEmail || DEV_EMAIL
    const password = envPassword || DEV_PASSWORD
    const usedFallback = !envPassword
    const now = new Date().toISOString()

    let userId = await findId('users', 'email', email)
    if (!userId) {
      await db.insertInto('users' as any).values({
        name: DEV_NAME,
        email,
        password: await makeHash(password, { algorithm: 'bcrypt' }),
        uuid: crypto.randomUUID(),
        // Both are NOT NULL on this app's users table.
        is_super_admin: false,
        two_factor_enabled: false,
        // Pre-verified: the local mailbox does not exist, so a seeded account
        // that had to click a link in an email could never finish signing in.
        email_verified_at: now,
        created_at: now,
        updated_at: now,
      } as any).execute()
      userId = await findId('users', 'email', email)
    }
    else if (isLocal) {
      /*
       * Keep the documented local password working. Re-running the seeder
       * after changing DEV_PASSWORD, or after some earlier experiment wrote
       * this row with a different hash, would otherwise leave a row that
       * exists and cannot be signed in to -- which is the exact failure this
       * file is here to end. Checked before writing so a run that changes
       * nothing issues no UPDATE, and confined to local environments so a
       * deploy never silently rotates a real account's password.
       */
      const row = await db.selectFrom('users' as any)
        .select(['password'] as any)
        .where('email' as any, '=', email)
        .executeTakeFirst() as { password?: string } | undefined

      const matches = await passwordMatches(password, row?.password)
      if (!matches) {
        await db.updateTable('users' as any)
          .set({ password: await makeHash(password, { algorithm: 'bcrypt' }), updated_at: now } as any)
          .where('email' as any, '=', email)
          .execute()
        log.info('[OwnerSeeder] Reset the local owner password to match this seeder.')
      }
    }

    if (!userId)
      throw new Error('The Status owner account could not be resolved after creation.')

    let teamId = await findId('teams', 'name', WORKSPACE)
    if (!teamId) {
      await db.insertInto('teams' as any).values({
        name: WORKSPACE,
        description: 'Owner workspace for Status.',
        status: 'active',
        member_count: 1,
        user_id: userId,
        owner: DEV_NAME,
        uuid: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      } as any).execute()
      teamId = await findId('teams', 'name', WORKSPACE)
    }

    if (!teamId)
      throw new Error('The Status owner workspace could not be resolved after creation.')

    const membership = await db.selectFrom('team_members' as any)
      .select(['id'] as any)
      .where('team_id' as any, '=', teamId)
      .where('user_id' as any, '=', userId)
      .executeTakeFirst() as IdentifiedRow | undefined

    if (!membership) {
      await db.insertInto('team_members' as any).values({
        team_id: teamId,
        user_id: userId,
        role: 'owner',
        status: 'active',
        uuid: crypto.randomUUID(),
        joined_at: now,
        created_at: now,
        updated_at: now,
      } as any).execute()
    }

    log.info(`[OwnerSeeder] Owner workspace is ready for ${email}.`)
    if (usedFallback)
      log.info(`[OwnerSeeder] Local fallback credentials in use: ${email} / ${DEV_PASSWORD}`)
  }
}

if (import.meta.main)
  await new OwnerSeeder().run()
