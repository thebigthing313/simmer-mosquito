import {
	type SampleFilters,
	sampleFilterCodecs,
	sampleFilterDefaults,
} from '../../components/larval-surveillance/samples-search';
import { todayInTimeZone } from '../../lib/local-date';
import { DATE_RANGE_COUNTING } from '../../lib/search-filters';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** The sample filter set on the URL, and what it resets to. */
export interface SampleFilterBinding {
	readonly filters: SampleFilters;
	readonly setFilters: (patch: Partial<SampleFilters>) => void;
	readonly reset: () => void;
	readonly activeCount: number;
	readonly defaults: SampleFilters;
	/** The Organization's today, which the date window ends on. */
	readonly today: string;
}

/**
 * The sample filters the Samples Map and the Samples Table both read, held on
 * the URL through `sampleFilterCodecs`. The window ends on the Organization's
 * today rather than the browser's.
 */
export function useSampleFilterState(): SampleFilterBinding {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const defaults = sampleFilterDefaults(today);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		defaults,
		sampleFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, defaults, today };
}
