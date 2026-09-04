/**
 * The folders regions are filed under: adding one, renaming it.
 *
 * Two commands, because that is all the app offers. `deleteRegionFolder` exists
 * in the domain and on the server, and nothing in `apps/web` calls it — there is
 * no delete control on the folder dialog. It carries the third of this domain's
 * acknowledgements (`acknowledgedRegionDetach`, for the regions that come loose
 * rather than being deleted with it), which is worth knowing about before that
 * control is added.
 */

import { type RegionFolder, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { region_folders } from '../../lib/collections/region_folders';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { optimisticStamp } from './shared';

/** A folder as its dialog holds one. */
export interface RegionFolderFields {
	readonly name: string;
	readonly description: string | null;
}

export interface RegionFolderMutations {
	readonly create: (folderId: string, fields: RegionFolderFields) => Promise<void>;
	readonly save: (
		folderId: string,
		fields: RegionFolderFields,
		current: RegionFolderFields,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useRegionFolderMutations(): RegionFolderMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (folderId: string, fields: RegionFolderFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(region_folders(), {
					operation: 'insert',
					intent: 'foundation.createRegionFolder',
					row: {
						id: folderId,
						organization_id: organizationId,
						name: fields.name,
						description: fields.description,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies RegionFolder,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (folderId: string, fields: RegionFolderFields, current: RegionFolderFields) => {
			// One command, so there is no plan to build — but the same rule holds:
			// the domain refuses an update with nothing to change.
			if (fields.name === current.name && fields.description === current.description) {
				return;
			}

			await settleWrite(
				mutateCollection(region_folders(), {
					operation: 'update',
					intent: 'foundation.updateRegionFolder',
					key: folderId,
					changes: {
						name: fields.name,
						description: fields.description,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	return { create, save, canWrite: organizationId !== null && actorProfileId !== null };
}
