import {
	type ApplicationFilters,
	applicationFilterCodecs,
	applicationFilterDefaults,
} from '../../components/control-operations/chemical/applications-search';
import { todayInTimeZone } from '../../lib/local-date';
import { DATE_RANGE_COUNTING } from '../../lib/search-filters';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** The chemical application filter set on the URL, and what it resets to. */
export interface ApplicationFilterBinding {
	readonly filters: ApplicationFilters;
	readonly setFilters: (patch: Partial<ApplicationFilters>) => void;
	readonly reset: () => void;
	readonly activeCount: number;
	readonly defaults: ApplicationFilters;
	/** The Organization's today, which the date window ends on. */
	readonly today: string;
}

/**
 * The chemical application filters the Chemical Applications Map and Table both
 * read, held on the URL through `applicationFilterCodecs`. The window ends on
 * the Organization's today rather than the browser's.
 */
export function useApplicationFilterState(): ApplicationFilterBinding {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const defaults = applicationFilterDefaults(today);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		defaults,
		applicationFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, defaults, today };
}
