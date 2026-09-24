/**
 * The sort a record table holds on the URL: one column and one direction.
 *
 * Each table names its own keys, since which columns can sort is a question
 * about the collection behind it. What a header click does to the sort is the
 * same on every table, so it is written once here.
 */

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface TableSort<TKey extends string> {
	readonly key: TKey;
	readonly direction: SortDirection;
}

/**
 * Where a click on a column header leaves the sort.
 *
 * A column that is already sorted turns around. Any other column opens
 * descending, which is the end every sortable column here is read from: the
 * newest record, the highest number, the most of something.
 */
export function nextSort<TKey extends string>(
	current: TableSort<TKey>,
	key: TKey,
): TableSort<TKey> {
	if (current.key !== key) {
		return { key, direction: 'desc' };
	}
	return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}
