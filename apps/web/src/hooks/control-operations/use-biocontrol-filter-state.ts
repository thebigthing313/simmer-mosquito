import {
	type BiocontrolFilters,
	biocontrolFilterCodecs,
	biocontrolFilterDefaults,
} from '../../components/control-operations/biocontrol/biocontrol-actions-search';
import { todayInTimeZone } from '../../lib/local-date';
import { DATE_RANGE_COUNTING } from '../../lib/search-filters';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** The biocontrol filter set on the URL, and what it resets to. */
export interface BiocontrolFilterBinding {
	readonly filters: BiocontrolFilters;
	readonly setFilters: (patch: Partial<BiocontrolFilters>) => void;
	readonly reset: () => void;
	readonly activeCount: number;
	readonly defaults: BiocontrolFilters;
	/** The Organization's today, which the date window ends on. */
	readonly today: string;
}

/**
 * The biocontrol filters the Biocontrol Actions Map and Table both read, held
 * on the URL through `biocontrolFilterCodecs`. The window ends on the
 * Organization's today rather than the browser's.
 */
export function useBiocontrolFilterState(): BiocontrolFilterBinding {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const defaults = biocontrolFilterDefaults(today);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		defaults,
		biocontrolFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, defaults, today };
}
