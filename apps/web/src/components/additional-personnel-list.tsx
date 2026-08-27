import { useMemo } from 'react';
import {
	type AdditionalPersonnelTarget,
	useAdditionalPersonnel,
} from '../hooks/queries/use-additional-personnel';
import { useProfileNames } from '../hooks/queries/use-profile-names';

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
	// Names, not the roster: this lists who worked the record, and a crew member
	// who has since left still worked it. Service status is a picker's question.
	const nameById = useProfileNames();

	const names = useMemo(
		() =>
			profileIds
				.map((profileId) => nameById.get(profileId) ?? 'Unknown profile')
				.sort((first, second) => first.localeCompare(second)),
		[nameById, profileIds],
	);

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
