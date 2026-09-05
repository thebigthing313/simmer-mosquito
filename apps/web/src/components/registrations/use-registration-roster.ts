import { useMemo } from 'react';
import {
	type RegistrationListing,
	useRegistrationDirectory,
} from '../../hooks/queries/use-registration-directory';
import { useUnitLabels } from '../../hooks/queries/use-unit-labels';

export interface RegistrationRoster {
	readonly registrations: readonly RegistrationListing[];
	readonly unitsById: ReadonlyMap<string, { readonly code: string }>;
	readonly isReady: boolean;
}

/**
 * One contact's registrations, with the units their buffers are written in.
 *
 * Filtered from the organization-wide directory rather than read per contact,
 * because that directory is already what the sync layer holds and a per-contact
 * read would be a second shape over the same rows. An organization's
 * registrations number in the hundreds, not the millions.
 *
 * Inactive ones are hidden by default and offered behind a filter. A retired
 * registration still appears on missions already generated, so it is not gone,
 * and a list that dropped it silently would leave somebody looking for a record
 * they know exists.
 */
export function useRegistrationRoster(
	contactId: string,
	includeInactive: boolean,
): RegistrationRoster {
	const directory = useRegistrationDirectory();
	const { all: units } = useUnitLabels();

	const registrations = useMemo(
		() =>
			directory.registrations.filter(
				(registration) =>
					registration.contactId === contactId && (includeInactive || registration.isActive),
			),
		[contactId, directory.registrations, includeInactive],
	);

	const unitsById = useMemo(
		() => new Map(units.map((unit) => [unit.id, { code: unit.code }])),
		[units],
	);

	return { registrations, unitsById, isReady: directory.isReady };
}
