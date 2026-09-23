import { type RawBuilder, sql } from 'kysely';

// --- the date window ---------------------------------------------------------
//
// A surface's window is two inclusive `YYYY-MM-DD` bounds over the record's
// operational date, either one optional. Seven surfaces wrote the pair of
// tests out longhand before the service requests surface became the eighth
// (#1216); this is the pair once, and the others can move onto it as they are
// touched.

/**
 * Match records whose `date` falls inside `[from, to]`, each bound applied
 * only when it is given. `date` is the surface's own expression, because a
 * collection's effective date is a `coalesce` and not a column.
 */
export function dateWindowClauses(
	date: RawBuilder<unknown>,
	window: { readonly dateFrom?: string | undefined; readonly dateTo?: string | undefined },
): RawBuilder<boolean>[] {
	const clauses: RawBuilder<boolean>[] = [];
	if (window.dateFrom !== undefined) {
		clauses.push(sql<boolean>`${date} >= ${window.dateFrom}`);
	}
	if (window.dateTo !== undefined) {
		clauses.push(sql<boolean>`${date} <= ${window.dateTo}`);
	}
	return clauses;
}
