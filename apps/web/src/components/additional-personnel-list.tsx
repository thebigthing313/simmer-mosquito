import type { ProfileRow } from '@simmer-mosquito/sync';
import { useMemo } from 'react';
import { useCollectionRows } from '../hooks/use-collection-rows';
import { webCollections } from '../sync/webCollections';
import { type AdditionalPersonnelTarget, useAdditionalPersonnel } from './additional-personnel';

/**
 * The crew attached to a record, for its detail page.
 *
 * Stacked rather than fitted into a `DetailRow`, whose label column is too narrow
 * for the term — and renders nothing at all when a record has no crew, since an
 * empty row on every solo job is noise.
 */
export function AdditionalPersonnelList({
	target,
}: {
	readonly target: AdditionalPersonnelTarget;
}) {
	const { profileIds, isReady } = useAdditionalPersonnel(target);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	const names = useMemo(() => {
		const nameById = new Map(profiles.map((profile) => [profile.id, profile.displayName]));
		return profileIds
			.map((profileId) => nameById.get(profileId) ?? 'Unknown profile')
			.sort((first, second) => first.localeCompare(second));
	}, [profiles, profileIds]);

	if (!isReady || names.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1 text-sm">
			<span className="text-muted-foreground">Additional personnel</span>
			<span className="text-foreground">{names.join(', ')}</span>
		</div>
	);
}
