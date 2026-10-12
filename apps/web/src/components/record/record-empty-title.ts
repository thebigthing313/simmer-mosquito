import { type RecordType, recordNoun } from '../../lib/record-nouns';

/**
 * What a record set holds with no filter set, which is the one part of its
 * empty title a set decides: `No Active Habitats`, `No Inspections Yet`,
 * `No Samples in the Last 30 Days`, `No Service Requests This Year`.
 */
export type RecordEmptyScope =
	| { readonly kind: 'active' }
	| { readonly kind: 'yet' }
	| { readonly kind: 'lastDays'; readonly days: number }
	| { readonly kind: 'thisYear' };

/**
 * Why a list of records is empty, as far as its title says: the set's scope
 * with nothing set, `match` with a filter set, `inView` for matches that sit
 * outside a map's viewport, and `loading` before any answer.
 */
export type RecordEmptyTitle =
	| RecordEmptyScope
	| { readonly kind: 'match' }
	| { readonly kind: 'inView' }
	| { readonly kind: 'loading' };

/**
 * The empty-state title of a record list, written once for the Map's rail and
 * the Table so the two say the same sentence in the same Title Case (#1653).
 */
export function recordEmptyTitle(recordType: RecordType, title: RecordEmptyTitle): string {
	const { titleMany } = recordNoun(recordType);
	switch (title.kind) {
		case 'active':
			return `No Active ${titleMany}`;
		case 'yet':
			return `No ${titleMany} Yet`;
		case 'lastDays':
			return `No ${titleMany} in the Last ${title.days} Days`;
		case 'thisYear':
			return `No ${titleMany} This Year`;
		case 'match':
			return `No ${titleMany} Match`;
		case 'inView':
			return `No ${titleMany} in View`;
		case 'loading':
			return `Loading ${titleMany}`;
	}
}
