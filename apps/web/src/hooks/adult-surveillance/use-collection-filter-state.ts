import {
	type CollectionFilters,
	collectionFilterCodecs,
	collectionFilterDefaults,
} from '../../components/adult-surveillance/collections/collections-search';
import { todayInTimeZone } from '../../lib/local-date';
import { DATE_RANGE_COUNTING } from '../../lib/search-filters';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import { useSearchFilters } from '../use-search-filters';

/** The collection filter set on the URL, and what it resets to. */
export interface CollectionFilterBinding {
	readonly filters: CollectionFilters;
	readonly setFilters: (patch: Partial<CollectionFilters>) => void;
	readonly reset: () => void;
	readonly activeCount: number;
	/** The Organization's today, which the date window ends on. */
	readonly today: string;
}

/**
 * The collection filters the Collections Map and the Collections Table both
 * read, held on the URL through `collectionFilterCodecs`. The window ends on
 * the Organization's today rather than the browser's.
 */
export function useCollectionFilterState(): CollectionFilterBinding {
	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	const { filters, setFilters, reset, activeCount } = useSearchFilters(
		collectionFilterDefaults(today),
		collectionFilterCodecs,
		DATE_RANGE_COUNTING,
	);
	return { filters, setFilters, reset, activeCount, today };
}
