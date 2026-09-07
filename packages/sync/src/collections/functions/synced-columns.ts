/**
 * The columns a schema declares, in a module that imports nothing but a type.
 *
 * It sat in `sync-collection.ts` until #628, which is where it reads best but
 * not where it can be reached from. That module value-imports the mutation
 * handlers and the session fetcher, so the contract entry naming this function
 * from there would pull the browser write path in behind it: the command
 * request builder, the transaction wrapper and the fetcher a host installs its
 * credential into. `apps/server` wants the answer to one question about a
 * schema and registers the routes the write path posts to, so it should be
 * evaluating none of that.
 *
 * `sync-collection.ts` re-exports it, so the client half names it exactly where
 * it did before.
 */

import type { z } from 'zod';

/** The columns a schema declares, which is what its shape route must serve. */
export function syncedColumnsOf(schema: z.ZodObject<z.ZodRawShape>): readonly string[] {
	return Object.keys(schema.shape);
}
