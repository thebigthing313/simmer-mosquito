import type { ProfileRow } from '@simmer-mosquito/sync';
import { useMemo } from 'react';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { webCollections } from '../../sync/webCollections';
import type { FilterOption } from './multi-select-filter';

/**
 * The agency's people, as filter options and as an id→name lookup.
 *
 * Every field record is attributed to someone — an inspector, an applicator, a
 * technician — and "what did this crew member do" is a question every explorer
 * gets asked. Profiles are eagerly synced, so this needs no fetch.
 */
export function usePersonnelOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	return useMemo(() => {
		const sorted = [...profiles].sort((first, second) =>
			first.displayName.localeCompare(second.displayName),
		);
		return {
			options: sorted.map((profile) => ({ id: profile.id, label: profile.displayName })),
			nameById: new Map(sorted.map((profile) => [profile.id, profile.displayName] as const)),
		};
	}, [profiles]);
}
