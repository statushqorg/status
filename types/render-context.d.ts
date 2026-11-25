/**
 * Names a render context carries into a template, as AMBIENT declarations for
 * `stx typecheck` (passed with --lib by `typecheck:views`; the checker does not
 * read tsconfig's include).
 *
 * stx renders a template with the keys of its context as bare names, so a route
 * segment, or a value an including page's server block defines, arrives in the
 * file that reads it with nothing there to declare it. Same role as the
 * render-context.d.ts in the other five HQ apps.
 *
 * Shapes are restated rather than imported: a --lib file with an import stops
 * being ambient and would take every declaration here out of scope.
 */

// --- Serve path ---------------------------------------------------------------

/**
 * The query string the serve path hands a page, set by the renderer before the
 * server block runs. Absent on a render without a request, hence `| undefined`
 * and the `typeof __stxServeSearch !== 'undefined'` guard every page reads it
 * through.
 */
// eslint-disable-next-line vars-on-top, no-var
declare var __stxServeSearch: string | undefined

// --- Route parameters ---------------------------------------------------------

/**
 * The dynamic segments, passed as bare names: `[id]` in dashboard/monitors,
 * servers, maintenance, status-pages, status-reports and the public incident
 * page; `[slug]` in dashboard/sites and status/; `[uuid]` in invite/. Absent on
 * a render that did not supply them, so each page guards with typeof.
 */
declare const id: string | undefined
declare const slug: string | undefined
declare const uuid: string | undefined

// --- partials/app-nav.stx -----------------------------------------------------

/**
 * Defined by every dashboard page that includes the nav, from
 * `resolveHealedTeamContext` (app/lib/teamContext.ts). Not optional: all 20
 * includers define them. SWITCHABLE_TEAMS is the exception the nav itself
 * guards with typeof, so it keeps `| undefined`.
 */

/** The signed-in user, or null. Restates `TeamUser` from app/lib/teamContext.ts. */
declare const AUTH_USER: { id: number, email: string, name?: string | null, is_super_admin?: boolean | number | null } | null
/** Which nav link is current. */
declare const NAV_ACTIVE: 'overview' | 'monitors' | 'servers' | 'incidents' | 'status-pages' | 'maintenance' | 'settings'
/** The active team's id, or -1 (the fail-closed sentinel) without one. */
declare const TEAM_ID: number
/** Whether the user is a super-admin. */
declare const IS_SUPER: boolean
/** A super-admin with no team pinned, seeing every team merged. */
declare const SEE_ALL: boolean
/** The active team's name, or '' when it is not among `SWITCHABLE_TEAMS`. */
declare const ACTIVE_TEAM_NAME: string
/** The teams the switcher offers. */
declare const SWITCHABLE_TEAMS: { id: number, name: string, role: string }[] | undefined

// --- partials/marketing-nav.stx, partials/marketing-footer.stx ----------------

/**
 * The product name, `process.env.APP_NAME || 'StatusHQ'`, defined by each
 * marketing and auth page's server block.
 */
declare const appName: string
