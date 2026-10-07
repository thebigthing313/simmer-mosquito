import {
	ADDRESS_FILTER_DEFAULTS,
	type AddressFilters,
	addressFilterCodecs,
} from '../../components/gis/addresses/addresses-search';
import { useDebouncedTextFilter } from '../use-debounced-text-filter';
import { useSearchFilters } from '../use-search-filters';

/** The address filter set on the URL, with the search box's typed text beside it. */
export interface AddressFilterBinding {
	readonly filters: AddressFilters;
	readonly setFilters: (patch: Partial<AddressFilters>) => void;
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
 * The address filters the Address Book Map and the Addresses Table both read,
 * held on the URL through `addressFilterCodecs`.
 */
export function useAddressFilterState(): AddressFilterBinding {
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		ADDRESS_FILTER_DEFAULTS,
		addressFilterCodecs,
	);
	const commitSearch = (next: string) => setFilters({ search: next });
	const {
		input: searchInput,
		setInput: setSearchInput,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(filters.search, commitSearch);

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
