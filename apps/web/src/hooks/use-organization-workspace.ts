import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { Organization } from '@simmer-mosquito/sync';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { AuthMe } from '../auth';
import { organizations } from '../lib/collections/organizations';
import { canManageCatalogs, canManageOperationalCatalogs } from '../lib/write-access';
import { readRole } from '../routes/my-organization/-components/helpers';

export function useOrganizationWorkspace(auth: AuthMe | null) {
	const result = useLiveSuspenseQuery((query) => query.from({ organization: organizations }), []);
	const organization: Organization | null = result.data[0] ?? null;
	if (organization === null) {
		throw new Error('Unable to resolve active organization for this workspace.');
	}
	const role = readRole(auth);
	// Two floors, because this workspace holds catalogs from both. `canManage`
	// is the owner/admin floor that configures the agency — settings, lookup
	// catalogs, insecticides. `canManageOperational` is the manager floor for
	// the catalogs that are part of running work: tags, vehicles, equipment,
	// and editing an existing control method.
	//
	// One flag for both was #65: a manager the server would have accepted saw
	// greyed-out controls, which is the safe direction but still wrong. Each
	// section reads the flag matching its command's floor in
	// `apps/server/src/command-permissions.ts`.
	const canManage = canManageCatalogs(auth);
	const canManageOperational = canManageOperationalCatalogs(auth);
	const settings = resolveOrganizationSettings(organization.settings).settings;

	return {
		canManage,
		canManageOperational,
		organization,
		organizationName: organization.name,
		role,
		settings,
	};
}
