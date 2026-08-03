import type { RegionRow } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { webCollections } from '../../sync/webCollections';
import type { FilterOption } from './multi-select-filter';

/**
 * The agency's regions, as filter options and as an id→name lookup.
 *
 * A region is the agency's own operational geography — a district, a zone, a
 * treatment area — and it is how field work is divided up, so "only show me this
 * district" is a question every map surface gets asked. Regions are grouped into
 * folders, so options are labelled by name alone and ordered alphabetically;
 * agencies keep tens of them, not thousands, and the picker searches.
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
	const { rows: organizationRows } = useCollectionRows(webCollections.currentOrganization);
	const organizationId = organizationRows[0]?.id ?? '';

	const result = useLiveQuery(
		{
			gcTime: regionsGcTimeMs,
			query: (query) =>
				query
					.from({ region: webCollections.regions })
					.where(({ region }) => eq(region.organizationId, organizationId))
					.orderBy(({ region }) => region.name, 'asc'),
		},
		[organizationId],
	);

	const regions = result.data as readonly RegionRow[] | undefined;

	return useMemo(() => {
		const rows = regions ?? [];
		return {
			options: rows.map((region) => ({ id: region.id, label: region.name })),
			nameById: new Map(rows.map((region) => [region.id, region.name] as const)),
		};
	}, [regions]);
}

// Regions are picked, unpicked, and re-picked while an operator narrows a map;
// holding the subset briefly past unmount keeps that from refetching each time.
const regionsGcTimeMs = 30_000;
