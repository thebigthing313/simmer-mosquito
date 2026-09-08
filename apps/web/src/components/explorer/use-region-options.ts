import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { unmatchableId } from '../../hooks/queries/shared';
import { useOrganizationIdentity } from '../../hooks/queries/use-organization-identity';
import { regions } from '../../lib/collections/regions';
import type { FilterOption } from './multi-select-filter';

/**
 * The organization's regions, as filter options and as an id→name lookup.
 *
 * A region is the organization's own operational geography — a district, a
 * zone, a treatment area — and it is how field work is divided up, so "only
 * show me this district" is a question every map surface gets asked. Regions
 * are grouped into folders, so options are labelled by name alone and ordered
 * alphabetically; organizations keep tens of them, not thousands, and the
 * picker searches.
 *
 * `regions` is an on-demand shape, so this drives its subset with an org-scoped
 * live query rather than reading an already-local catalog. Plain `useLiveQuery`,
 * not the suspense variant — the suspense hook hangs when a route unmounts over
 * an on-demand collection.
 */
export function useRegionOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const organizationId = useOrganizationIdentity()?.id ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: regionsGcTimeMs,
			query: (query) =>
				query
					.from({ region: regions() })
					.where(({ region }) => eq(region.organization_id, organizationId))
					.orderBy(({ region }) => region.name, 'asc')
					.select(({ region }) => ({ id: region.id, label: region.name })),
		},
		[organizationId],
	);

	const options = result.data;

	return useMemo(
		() => ({
			options,
			nameById: new Map(options.map((region) => [region.id, region.label] as const)),
		}),
		[options],
	);
}

// Regions are picked, unpicked, and re-picked while an operator narrows a map;
// holding the subset briefly past unmount keeps that from refetching each time.
const regionsGcTimeMs = 30_000;
