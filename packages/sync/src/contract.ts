/**
 * What is true of a synced table anywhere, without what a browser does with one.
 *
 * The root entry is the client half: 56 collection factories, each of which
 * value-imports `@tanstack/db` and `@tanstack/electric-db-collection` because
 * that is what a factory is for. `apps/server` needs four symbols from this
 * package and never creates a collection, so importing from the root made a
 * long-running Node process evaluate both libraries and all 56 factories at boot
 * to read `Object.keys` off a zod shape (#628).
 *
 * So the package has a second door rather than a second package. The boundary
 * ADR 0007 draws is unchanged: this package still owns what is true of a table
 * everywhere, and each frontend still owns its own collection singletons. Which
 * door you come in by says what you want, not which package you are talking to.
 *
 * Everything named here reaches only `zod`. A module added to this entry that
 * value-imports either TanStack package puts the whole client stack back, so
 * check what a new export drags in behind it before adding one.
 */

export { commandPathFor, shapePathFor } from './collections/functions/routes.js';
export { syncedColumnsOf } from './collections/functions/synced-columns.js';
export { type SyncedTable, tableSchemas } from './collections/tables/index.js';
