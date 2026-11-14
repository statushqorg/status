/**
 * Run a read whose failure should render as "no rows" rather than fail the page.
 *
 * A query answers where it is written: on the on-thread driver `.execute()`
 * returns the rows themselves and a failure throws at the call, so the old
 * `query.execute().catch(() => [])` throws a TypeError on the success path
 * (an array has no `.catch`). Taking the query as a function covers both a
 * value and a promise, and a throw from either.
 */
export async function rowsOrEmpty<T = any>(run: () => T[] | Promise<T[]>): Promise<T[]> {
  try {
    const rows = await run()
    return Array.isArray(rows) ? rows : []
  }
  catch {
    return []
  }
}
