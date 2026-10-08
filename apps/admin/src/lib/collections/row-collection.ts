/**
 * Hold a generated factory's collection as a collection of its row.
 *
 * The factory's collection carries its schema's insert input, where a column
 * with a default is optional and typed `unknown`. Since `@tanstack/db` 0.10
 * typed `update`'s key, TypeScript compares `update`'s drafts, which are that
 * input, so the factory's type no longer assigns to `Collection<Row, …>`. The
 * row is still checked: pass the wrong row type and the argument is refused.
 * `apps/web` does the same once, in `lib/collections/registry.ts`.
 */

import type { Collection, UtilsRecord } from '@tanstack/db';

// biome-ignore lint/suspicious/noExplicitAny: the schema and its insert input are the factory's own, and this narrows past them.
type UncheckedFactoryArgument = any;

export function rowCollection<TRow extends object>(
	collection: Collection<
		TRow,
		string | number,
		UtilsRecord,
		UncheckedFactoryArgument,
		UncheckedFactoryArgument
	>,
): Collection<TRow, string | number> {
	return collection as Collection<TRow, string | number>;
}
