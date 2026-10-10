import {
	type RecordSet,
	type RecordSetContext,
	type RecordSetSurface,
	recordSetCounting,
	recordSetInert,
	surfaceApplies,
	surfaceCodecs,
} from '../../components/explorer/record-set';
import { todayInTimeZone } from '../../lib/local-date';
import type { FilterBinding } from '../../lib/search-filters';
import { useOrganizationSettings } from '../queries/use-organization-settings';
import { useDebouncedTextFilter } from '../use-debounced-text-filter';
import { useSearchFilters } from '../use-search-filters';

/** The search box over a set's text filter, which types ahead of the URL. */
export interface TextSearchBinding {
	/** What the search box shows, which runs ahead of the committed term. */
	readonly searchInput: string;
	readonly setSearchInput: (next: string) => void;
	/** Empties the box and drops the committed term. */
	readonly clearSearch: () => void;
	/** Empties the box and drops every filter param. */
	readonly clearAll: () => void;
}

/**
 * A record set's filters on one surface, with its search box beside them, the
 * context they were resolved in, which the set's tile conversion reads, and
 * the filters the set calls inert in that context, which the declarations draw
 * nothing for.
 */
export type RecordSetFilterBinding<TFilters> = FilterBinding<TFilters> &
	TextSearchBinding & {
		readonly context: RecordSetContext;
		readonly inert: ReadonlySet<keyof TFilters & string>;
	};

/**
 * The filters one surface of a record set reads and writes, held on the URL
 * through the set's codecs as that surface reads them. A key the surface does
 * not apply resolves to its default and counts nothing. The date window ends
 * on the Organization's today rather than the browser's.
 *
 * The search box half reads the set's `textSearch` key. A set with none, or a
 * surface that does not apply it, gets a box that commits nothing, and
 * `clearAll` is then `reset`.
 */
export function useRecordSetFilters<TFilters extends object, TTile>(
	set: RecordSet<TFilters, TTile>,
	surface: RecordSetSurface,
): RecordSetFilterBinding<TFilters> {
	const settings = useOrganizationSettings();
	const today = todayInTimeZone(settings.timezone);
	const context: RecordSetContext = { today, settings };
	const defaults = set.defaults(context, surface);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		defaults,
		surfaceCodecs(set, surface),
		recordSetCounting(set, context),
	);

	const textKey =
		set.textSearch !== undefined && surfaceApplies(set.applies[set.textSearch.key], surface)
			? set.textSearch.key
			: undefined;
	const committed = textKey === undefined ? '' : (filters[textKey] as string);
	const commitSearch = (next: string) => {
		if (textKey !== undefined) {
			setFilters({ [textKey]: next } as Partial<TFilters>);
		}
	};
	const {
		input: searchInput,
		setInput: setSearchInput,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(committed, commitSearch, set.textSearch?.delayMs);

	// Both halves: the field the operator is looking at, and the committed term
	// on the URL that is actually cutting the list. Clearing only the field
	// leaves the chip up and the results filtered.
	const clearSearch = () => {
		clearSearchInput();
		commitSearch('');
	};
	const clearAll = () => {
		clearSearchInput();
		reset();
	};

	return {
		filters,
		setFilters,
		reset,
		activeCount,
		defaults,
		today,
		searchInput,
		setSearchInput,
		clearSearch,
		clearAll,
		context,
		inert: recordSetInert(set, context),
	};
}
