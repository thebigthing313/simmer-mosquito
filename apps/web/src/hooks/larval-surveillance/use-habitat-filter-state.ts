import {
	HABITAT_FILTER_DEFAULTS,
	type HabitatFilters,
	habitatFilterCodecs,
} from '../../components/larval-surveillance/habitats/habitats-search';
import { useDebouncedTextFilter } from '../use-debounced-text-filter';
import { useSearchFilters } from '../use-search-filters';

/** The habitat filter set on the URL, with the search box's typed text beside it. */
export interface HabitatFilterBinding {
	readonly filters: HabitatFilters;
	readonly setFilters: (patch: Partial<HabitatFilters>) => void;
	readonly activeCount: number;
	/** What the search box shows, which runs ahead of the committed term. */
	readonly searchInput: string;
	readonly setSearchInput: (next: string) => void;
	/** Empties the box and drops the committed term. */
	readonly clearSearch: () => void;
	/** Empties the box and drops every filter param. */
	readonly clearAll: () => void;
}

/**
 * The habitat filters the Habitats Map and the Habitats Table both read, held
 * on the URL through `habitatFilterCodecs`.
 */
export function useHabitatFilterState(): HabitatFilterBinding {
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		HABITAT_FILTER_DEFAULTS,
		habitatFilterCodecs,
	);
	const commitSearch = (next: string) => setFilters({ search: next });
	const {
		input: searchInput,
		setInput: setSearchInput,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(filters.search, commitSearch);

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
		activeCount,
		searchInput,
		setSearchInput,
		clearSearch,
		clearAll,
	};
}
