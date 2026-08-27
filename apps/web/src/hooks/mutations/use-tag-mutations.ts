/**
 * Writing the Tag catalog.
 *
 * The ninth catalog, and the same four questions the other eight answer — add
 * one, edit one, retire or restore one, delete one — so the writes come from
 * `catalog-writes.ts` and only the row literal and the five command names are
 * stated here. It is its own file rather than a ninth hook in
 * `use-catalog-mutations.ts` because a Tag has a colour and none of the others
 * do, and `CatalogFields` would grow a member that is absent eight times out of
 * nine.
 *
 * Two things the endpoint being replaced inferred:
 *
 * `isActive` arriving in a PATCH meant `activateTag` *or* `deactivateTag`
 * depending on which way the boolean pointed. Which way it moved is the
 * command's to say, so both are named here and the column is written only so the
 * row on screen moves before the server answers.
 *
 * And the POST body had no `isActive` at all, so a Tag created with the switch
 * off was written active and the switch flicked back on when the write synced —
 * the same bug the eight lookup catalogs had, and the same fix: `create` names
 * `deactivateTag` beside `createTag`, and both commit in one transaction.
 *
 * Assigning a Tag to a record is `tag_items` and a different seam entirely; see
 * `use-record-tags.ts` for the read and `fieldWorkMissionMutations` for what is
 * left of the write.
 */

import type { Tag } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { tags } from '../../lib/collections/tags';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type CatalogCommandNames,
	createCatalogRow,
	deleteCatalogRow,
	saveCatalogRow,
	setCatalogRowActive,
} from './catalog-writes';
import { newRecordId, optimisticStamp } from './shared';

/** A Tag as its dialog holds one. */
export interface TagFields {
	readonly name: string;
	readonly description: string | null;
	/** A hex string, or `null` for a Tag the agency left uncoloured. */
	readonly color: string | null;
	readonly isActive: boolean;
}

/**
 * `reactivate` is `activateTag` — the Tag commands were named before the eight
 * lookup catalogs settled on `reactivate`, and the domain vocabulary is what it
 * is. The shape is identical.
 */
const tagCommands: CatalogCommandNames = {
	create: 'fieldWork.createTag',
	update: 'fieldWork.updateTag',
	deactivate: 'fieldWork.deactivateTag',
	reactivate: 'fieldWork.activateTag',
	remove: 'fieldWork.deleteTag',
};

export interface TagMutations {
	/** Returns the new Tag's id, so a caller can select or scroll to it. */
	readonly create: (fields: TagFields) => Promise<string>;
	/**
	 * Save an edited Tag.
	 *
	 * `current` is what it looked like before, because which commands a save means
	 * is a function of what moved: renaming or recolouring is `updateTag`,
	 * flipping the switch is `activateTag` or `deactivateTag`, and doing both at
	 * once is both names on one write.
	 */
	readonly save: (id: string, fields: TagFields, current: TagFields) => Promise<void>;
	/** The one-click retire and restore on the row menu. */
	readonly setActive: (id: string, isActive: boolean) => Promise<void>;
	readonly remove: (id: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useTagMutations(): TagMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (fields: TagFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			const row = {
				id: newRecordId(),
				organization_id: organizationId,
				tag_name: fields.name,
				description: fields.description,
				color: fields.color,
				is_active: fields.isActive,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			} satisfies Tag;
			await createCatalogRow(tags, tagCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(async (id: string, fields: TagFields, current: TagFields) => {
		// Only the columns that moved: the domain refuses an update with nothing
		// to change, so naming it on a save that only flipped the switch would
		// fail the whole write.
		const changes: Partial<Tag> = {};
		if (fields.name !== current.name) {
			changes.tag_name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description;
		}
		if (fields.color !== current.color) {
			changes.color = fields.color;
		}

		await saveCatalogRow(tags, tagCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
		});
	}, []);

	const setActive = useCallback(
		(id: string, isActive: boolean) => setCatalogRowActive(tags, tagCommands, id, isActive),
		[],
	);

	const remove = useCallback((id: string) => deleteCatalogRow(tags, tagCommands, id), []);

	return {
		create,
		save,
		setActive,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
