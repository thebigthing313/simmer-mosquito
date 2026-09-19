import type { LarvalDensity } from '@simmer-mosquito/domain';
import type { InspectionOpeningWindow } from '../../components/larval-surveillance/inspection-filters';
import type { InspectionFilters } from '../../components/larval-surveillance/inspections-search';
import { addDaysToDateString, todayInTimeZone } from '../../lib/local-date';
import { useOrganizationTimeZone } from '../use-organization-time-zone';

/** How far back the map opens, and what Clear all returns it to. */
const DEFAULT_WINDOW_DAYS = 30;

/**
 * What an inspection surface's address with no filter params means, and the
 * Organization's today. The opening window is the last 30 days or all time.
 */
export function useInspectionFilterDefaults(opening: InspectionOpeningWindow): {
	readonly defaults: InspectionFilters;
	readonly today: string;
} {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const defaults: InspectionFilters = {
		from: opening === 'all-time' ? '' : addDaysToDateString(today, -(DEFAULT_WINDOW_DAYS - 1)),
		to: opening === 'all-time' ? '' : today,
		water: 'all',
		density: new Set<LarvalDensity>(),
		positive: false,
		types: new Set<string>(),
		inspectors: new Set<string>(),
		regions: new Set<string>(),
	};
	return { defaults, today };
}
