import {
	type SourceReductionFilters,
	sourceReductionFilterCodecs,
	sourceReductionFilterDefaults,
} from '../../components/control-operations/source-reduction/source-reductions-search';
import { todayInTimeZone } from '../../lib/local-date';
import { DATE_RANGE_COUNTING } from '../../lib/search-filters';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** The source reduction filter set on the URL, and what it resets to. */
export interface SourceReductionFilterBinding {
	readonly filters: SourceReductionFilters;
	readonly setFilters: (patch: Partial<SourceReductionFilters>) => void;
	readonly reset: () => void;
	readonly activeCount: number;
	/** The Organization's today, which the date window ends on. */
	readonly today: string;
}

/**
 * The source reduction filters the Source Reductions Map and Table both read,
 * held on the URL through `sourceReductionFilterCodecs`. The window ends on the
 * Organization's today rather than the browser's.
 */
export function useSourceReductionFilterState(): SourceReductionFilterBinding {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		sourceReductionFilterDefaults(today),
		sourceReductionFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, today };
}
