import type { StatusFilter } from '../../routes/gis/weather/-legend';
import {
	STATION_FILTER_CODECS,
	STATION_FILTER_DEFAULTS,
	type StationFilterState,
} from '../../routes/gis/weather/-station-filters';
import { useDebouncedTextFilter } from '../use-debounced-text-filter';
import { useSearchFilters } from '../use-search-filters';

/**
 * The weather station list's filter state, on the URL: the committed search
 * and status, the search box's own value running ahead of it, and the two
 * clears.
 */
export function useStationFilters(): StationFilterState {
	const {
		filters: query,
		setFilters,
		reset,
		activeCount: activeFilterCount,
	} = useSearchFilters(STATION_FILTER_DEFAULTS, STATION_FILTER_CODECS);
	const commitSearch = (next: string) => setFilters({ search: next });
	const {
		input: value,
		setInput: onChange,
		clear: clearSearchInput,
	} = useDebouncedTextFilter(query.search, commitSearch);

	// Both halves: the field the operator is looking at, and the committed term on
	// the URL that is actually cutting the list.
	const onClearSearch = () => {
		clearSearchInput();
		commitSearch('');
	};
	const onClearAll = () => {
		clearSearchInput();
		reset();
	};

	return {
		activeFilterCount,
		onChange,
		onClearAll,
		onClearSearch,
		onStatusChange: (next: StatusFilter) => setFilters({ status: next }),
		search: query.search,
		status: query.status,
		value,
	};
}
