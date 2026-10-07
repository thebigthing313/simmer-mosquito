import {
	type OutreachFilters,
	outreachFilterCodecs,
	outreachFilterDefaults,
} from '../../components/public-engagement/outreach/outreach-actions-search';
import { todayInTimeZone } from '../../lib/local-date';
import { DATE_RANGE_COUNTING } from '../../lib/search-filters';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** The outreach filter set on the URL, and what it resets to. */
export interface OutreachFilterBinding {
	readonly filters: OutreachFilters;
	readonly setFilters: (patch: Partial<OutreachFilters>) => void;
	readonly reset: () => void;
	readonly activeCount: number;
	/** The Organization's today, which the date window ends on. */
	readonly today: string;
}

/**
 * The outreach filters the Outreach Actions Map and Table both read, held on
 * the URL through `outreachFilterCodecs`. The window ends on the
 * Organization's today rather than the browser's.
 */
export function useOutreachFilterState(): OutreachFilterBinding {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		outreachFilterDefaults(today),
		outreachFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, today };
}
