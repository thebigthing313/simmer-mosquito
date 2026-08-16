/**
 * What every query hook in this folder shares.
 *
 * The folder is the app's read seam: a route asks for a shape by name, and what
 * it gets back is named for the domain rather than for the columns. Below that
 * line everything is snake_case, because that is what Electric streams and what
 * a pushed-down predicate has to compile to; above it nothing knows a column
 * exists.
 *
 * One hook per file, named for the hook — `useHabitatSearch` lives in
 * `use-habitat-search.ts`. A file here that is not a `use-` file is not a hook:
 * this one, and the per-domain view model each family of hooks returns.
 *
 * ## Where a transform belongs
 *
 * In the query, not in the hook body. A `select` is compiled into the query
 * pipeline and re-runs when a row changes; a `.map()` in the hook body re-runs on
 * every render, and hands out new objects each time, so every consumer redraws
 * whether or not anything changed. The observer already caches its snapshot, so a
 * transform placed in the query inherits that for free.
 *
 * Use a compiled `select`, and reach for what the expression language offers
 * before deciding it cannot say something — `coalesce`, `caseWhen`, `concat`,
 * `upper`, `lower`, `length`, the comparisons, the arithmetic, the aggregates. A
 * projection built from those is part of the pipeline: it narrows what is
 * materialized, and a row whose other columns moved produces no change
 * downstream at all.
 *
 * `fn.select` takes arbitrary JavaScript and gives up both of those — it runs per
 * emitted row and cannot be pushed down or planned. It also receives the source
 * namespaces rather than a prior projection, so a compiled `select` in front of
 * it narrows nothing. Treat it as the last resort it is; nothing in this folder
 * has needed it.
 *
 * A `useMemo` in a hook body is a sign the transform should have been a `select`.
 * The exception is an index over the rows — a `Map` keyed by id — because a query
 * returns rows and cannot return a lookup of them.
 */

/**
 * A uuid no row has, for the moment a hook is asked about nothing.
 *
 * A live query cannot be conditional — hooks run unconditionally — so a hook
 * whose id is not known yet asks for an id that cannot match, and gets an empty
 * result rather than the whole table. Only ever compared, never written.
 */
export const unmatchableId = '00000000-0000-0000-0000-000000000000';

/**
 * How long a subset survives after the last thing watching it unmounts.
 *
 * Thirty seconds, which covers a user opening a map card, closing it, and opening
 * it again — the case this exists for. It is a query option rather than a
 * collection one: the collection is shared, and how long one surface's subset
 * stays warm is that surface's business.
 */
export const mapCardGcTimeMs = 30_000;

/**
 * How long an activity subset stays warm.
 *
 * The overview panels are browsed back and forth through — yesterday, then the day
 * before, then back to yesterday — so the day just left is worth keeping for the
 * moment it takes to return to it.
 */
export const activityGcTimeMs = 30_000;
