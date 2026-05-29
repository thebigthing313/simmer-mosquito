import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { AuthMe } from '../auth';
import { readRole } from '../routes/my-organization/-components/helpers';
import { webCollections } from '../sync/webCollections';
import { useCollectionRows } from './use-collection-rows';

export function useOrganizationWorkspace(auth: AuthMe | null) {
	const { rows: organizationRows, status } = useCollectionRows(webCollections.currentOrganization);
	const organization = organizationRows[0] ?? null;
	if (status === 'ready' && organization === null) {
		throw new Error('Unable to resolve active organization for this workspace.');
	}
	const role = readRole(auth);
	const canManage = role === 'owner' || role === 'admin';
	const settings = resolveOrganizationSettings(organization?.settings).settings;
	const organizationName = organization?.name ?? 'Organization details';

	return {
		canManage,
		organization,
		organizationName,
		role,
		settings,
		status,
	};
}