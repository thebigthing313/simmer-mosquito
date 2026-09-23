import { useSyncExternalStore } from 'react';
import { appAuthController } from '../app-auth';

/** Whether this operator session is currently inside the given organization. */
export function useInsideOrganization(organizationId: string): boolean {
	const snapshot = useSyncExternalStore(
		appAuthController.subscribe,
		() => appAuthController.snapshot,
		() => appAuthController.snapshot,
	);

	return snapshot?.authenticated === true
		? snapshot.localIdentity.organizationId === organizationId
		: false;
}
