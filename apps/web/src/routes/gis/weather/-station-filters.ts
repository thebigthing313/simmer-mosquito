import { choiceParam, type FilterCodecs, textParam } from '../../../lib/search-filters';
import type { StatusFilter } from './-legend';

// The weather station list's filters: the declaration the route validates
// against and the state `useStationFilters` hands the rail.
// Dash-prefixed so TanStack Router ignores this file as a route.

export interface StationFilters {
	readonly search: string;
	readonly status: StatusFilter;
}

const STATUS_VALUES: readonly StatusFilter[] = ['all', 'active', 'inactive'];

/*
 * Active by default, matching Traps. A retired station keeps its readings and
 * stays reportable, so it is history rather than work, and a map that opens on
 * every station an organization ever ran is a map nobody can read.
 */
export const STATION_FILTER_DEFAULTS: StationFilters = { search: '', status: 'active' };
export const STATION_FILTER_CODECS: FilterCodecs<StationFilters> = {
	search: textParam,
	status: choiceParam(STATUS_VALUES, STATION_FILTER_DEFAULTS.status),
};

export interface StationFilterState {
	readonly activeFilterCount: number;
	readonly onChange: (next: string) => void;
	readonly onClearAll: () => void;
	readonly onClearSearch: () => void;
	readonly onStatusChange: (next: StatusFilter) => void;
	readonly search: string;
	readonly status: StatusFilter;
	/** The search box's own value, which runs ahead of the committed term. */
	readonly value: string;
}
