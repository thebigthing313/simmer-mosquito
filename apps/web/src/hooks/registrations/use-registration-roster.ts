import {
	type RegistrationListing,
	useRegistrationDirectory,
} from '../queries/use-registration-directory';
import { useUnitLabels } from '../queries/use-unit-labels';

export interface RegistrationRoster {
	readonly registrations: readonly RegistrationListing[];
	readonly unitsById: ReadonlyMap<string, { readonly code: string }>;
	readonly isReady: boolean;
}

/**
 * One contact's registrations, filtered from the organization-wide directory,
 * with the units their buffers are written in. Inactive ones are hidden unless
 * `includeInactive` is set.
 */
export function useRegistrationRoster(
	contactId: string,
	includeInactive: boolean,
): RegistrationRoster {
	const directory = useRegistrationDirectory();
	const { all: units } = useUnitLabels();

	const registrations = directory.registrations.filter(
		(registration) =>
			registration.contactId === contactId && (includeInactive || registration.isActive),
	);

	const unitsById = new Map(units.map((unit) => [unit.id, { code: unit.code }]));

	return { registrations, unitsById, isReady: directory.isReady };
}
