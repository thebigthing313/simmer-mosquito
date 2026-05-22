import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { AuthMe } from '../../../auth';
import { useCollectionRows } from '../../../sync/useCollectionRows';
import { collections } from './constants';
import { findCurrentOrganization, readOrganizationFallback, readRole } from './helpers';

export function useOrganizationWorkspace(auth: AuthMe | null) {
	const { rows: organizationRows, status } = useCollectionRows(collections.currentOrganization);
	const organization = findCurrentOrganization(organizationRows, auth);
	const organizationFallback = readOrganizationFallback(auth);
	const role = readRole(auth);
	const canManage = role === 'owner' || role === 'admin';
	const settings = resolveOrganizationSettings(organization?.settings).settings;
	const organizationName =
		organization?.name ?? organizationFallback.name ?? 'Organization details';

	return {
		canManage,
		organization,
		organizationFallback,
		organizationName,
		role,
		settings,
		status,
	};
}
