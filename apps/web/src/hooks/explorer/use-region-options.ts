import { eq, useLiveQuery } from '@tanstack/react-db';
import type { FilterOption } from '../../components/explorer/multi-select-filter';
import { regions } from '../../lib/collections/regions';
import { unmatchableId } from '../queries/shared';
import { useOrganizationIdentity } from '../queries/use-organization-identity';

/**
 * The organization's regions, as filter options and as an id to name lookup,
 * ordered by name.
 *
 * `regions` is an on-demand shape, so this drives its subset with an
 * organization-scoped `useLiveQuery` and the options are empty until it loads.
 */
export function useRegionOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const organizationId = useOrganizationIdentity()?.id ?? unmatchableId;

	const result = useLiveQuery({
		gcTime: regionsGcTimeMs,
		query: (query) =>
			query
				.from({ region: regions() })
				.where(({ region }) => eq(region.organization_id, organizationId))
				.orderBy(({ region }) => region.name, 'asc')
				.select(({ region }) => ({ id: region.id, label: region.name })),
	});

	const options = result.data;

	return {
		options,
		nameById: new Map(options.map((region) => [region.id, region.label] as const)),
	};
}

// Regions are picked, unpicked, and re-picked while an operator narrows a map;
// holding the subset briefly past unmount keeps that from refetching each time.
const regionsGcTimeMs = 30_000;
