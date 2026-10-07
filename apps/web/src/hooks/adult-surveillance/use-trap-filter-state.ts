import {
	TRAP_FILTER_DEFAULTS,
	type TrapFilters,
	trapFilterCodecs,
} from '../../components/adult-surveillance/traps/traps-search';
import { useDebouncedTextFilter } from '../use-debounced-text-filter';
import { useSearchFilters } from '../use-search-filters';

/** The trap filter set on the URL, with the search box's typed text beside it. */
export interface TrapFilterBinding {
	readonly filters: TrapFilters;
	readonly setFilters: (patch: Partial<TrapFilters>) => void;
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
 * The trap filters the Traps Map and the Traps Table both read, held on the
 * URL through `trapFilterCodecs`.
 */
export function useTrapFilterState(): TrapFilterBinding {
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		TRAP_FILTER_DEFAULTS,
		trapFilterCodecs,
	);
	const commitSearch = (next: string) => setFilters({ search: next });
	const {
		input: searchInput,
		setInput: setSearchInput,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(filters.search, commitSearch, 200);

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
