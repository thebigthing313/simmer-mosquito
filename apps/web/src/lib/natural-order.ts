/**
 * Name order that reads numbers as numbers: `CAR - S1 - 2` before
 * `CAR - S1 - 11`, where a character-by-character sort puts `11` through `19`
 * between `1` and `2`. Case and accents are folded the way `localeCompare`
 * already folded them, so only the digit runs change places.
 *
 * Two forms of one rule. `compareNames` is for an array sorted in memory, and
 * `NATURAL_ORDER` is the options object a live query's `orderBy` takes, for a
 * collection whose rows are all in memory. It is not for an on-demand
 * collection's `orderBy` beside a `limit`: that sort is pushed down to
 * Postgres, which orders the text lexically, and the page it returns would not
 * be the page this comparator expects. The server-sorted lists, the Habitats
 * Map rail and Table among them, need a numeric ICU collation in a migration
 * first.
 */

const COLLATOR = new Intl.Collator('en-US', { numeric: true });

export function compareNames(first: string, second: string): number {
	return COLLATOR.compare(first, second);
}

export const NATURAL_ORDER = {
	direction: 'asc',
	stringSort: 'locale',
	locale: 'en-US',
	localeOptions: { numeric: true },
} as const;
