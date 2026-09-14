/**
 * Rows folded into named groups, with whatever nobody is named on last.
 *
 * The larval and control-operations overviews each grouped a day's work by the
 * person who did it, and each wrote the same fold and the same three-branch
 * comparator to keep the unassigned group at the bottom of the list (#873). The
 * key and the name were the only things that differed, so they are the only
 * things a caller passes.
 *
 * Two orderings ride on this and neither is stated by the comparator, so both
 * are held here. A group takes its name from the first row that landed in it,
 * which is the same person every time, that being what grouped them. And a
 * `Map` iterates in insertion order while `Array.prototype.sort` is stable, so
 * two groups whose names compare equal stay in the order their first rows
 * arrived in.
 */

/** The key a row with nothing in its key column is filed under. */
export const UNASSIGNED_GROUP_KEY = '__unassigned__';

/** What the unassigned group is called on screen. */
const UNASSIGNED_GROUP_NAME = 'Unassigned';

export interface RowGroup<TRow> {
	readonly key: string;
	readonly name: string;
	readonly rows: readonly TRow[];
}

export function groupRows<TRow>(
	rows: readonly TRow[],
	options: {
		/** The id the rows are grouped on; `null` files the row as unassigned. */
		readonly key: (row: TRow) => string | null;
		/** The name to draw, read off the group's first row. */
		readonly name: (row: TRow) => string | null;
		/** What an assigned group with no name on its rows is called. */
		readonly unknownName: string;
	},
): readonly RowGroup<TRow>[] {
	const groups = new Map<string, TRow[]>();
	for (const row of rows) {
		const key = options.key(row) ?? UNASSIGNED_GROUP_KEY;
		const existing = groups.get(key);
		if (existing) {
			existing.push(row);
		} else {
			groups.set(key, [row]);
		}
	}
	return [...groups.entries()]
		.map(([key, grouped]) => {
			const first = grouped[0];
			const named = first === undefined ? null : options.name(first);
			return {
				key,
				name: key === UNASSIGNED_GROUP_KEY ? UNASSIGNED_GROUP_NAME : (named ?? options.unknownName),
				rows: grouped,
			};
		})
		.sort((first, second) => {
			if (first.key === UNASSIGNED_GROUP_KEY) {
				return 1;
			}
			if (second.key === UNASSIGNED_GROUP_KEY) {
				return -1;
			}
			return first.name.localeCompare(second.name);
		});
}
