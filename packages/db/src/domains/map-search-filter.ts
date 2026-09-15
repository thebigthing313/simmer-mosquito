import { type RawBuilder, sql } from 'kysely';

// --- search ------------------------------------------------------------------
//
// A surface's search is a case-insensitive substring match over the text a
// person would type to find the record, and every surface that offers one wrote
// the same `position()` test out per column. Habitats and service requests
// each carried a copy before #963 put the second beside the first.

/**
 * Match records where `search` appears in any of `columns`, or nothing when the
 * term is blank.
 *
 * `position()` rather than `like`, so what the person typed is matched as
 * typed and no wildcard has to be escaped. A nullable column is the caller's to
 * `coalesce`, since a null on one side of `or` would null that branch alone and
 * the caller knows which of its columns can be null.
 */
export function searchClauses(
	search: string | undefined,
	columns: readonly RawBuilder<unknown>[],
): RawBuilder<boolean>[] {
	const term = search?.trim();
	if (term === undefined || term.length === 0) {
		return [];
	}
	return [
		sql<boolean>`( ${sql.join(
			columns.map((column) => sql<boolean>`position(lower(${term}) in lower(${column})) > 0`),
			sql` or `,
		)} )`,
	];
}
