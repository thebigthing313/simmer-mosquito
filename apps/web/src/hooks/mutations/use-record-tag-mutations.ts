/**
 * Putting a Tag on a record and taking it off.
 *
 * The other half of `use-tag-mutations.ts`, which writes the catalog. Defining a
 * Tag is manager work on the My organization page; putting one on a record is
 * collector work on the record itself, so they are two hooks and two floors.
 *
 * A link row carries nothing of its own, so there are two commands and no
 * update, the same shape as `use-additional-personnel-mutations.ts`. There is no
 * set-reconcile helper beside them, because the tag picker writes on the click
 * rather than on a save: nothing here ever holds a set to settle.
 *
 * `entity_type` is written in the column's own snake_case spelling through
 * `toDbEntityType`, so the optimistic row and the row Electric streams back are
 * one row rather than two.
 *
 * A failed write throws. TanStack DB rolls the optimistic row back, so the tick
 * un-ticks itself, and the caller says why with `errorMessageForSave`: a tick
 * that silently undoes itself reads as a broken checkbox. The one refusal with
 * words of its own is `tag_already_assigned`, which is the partial unique index
 * on `tag_items` firing when two people tick the same box.
 */

import { type TagTarget, toDbEntityType } from '@simmer-mosquito/domain';
import { settleWrite, type TagItem } from '@simmer-mosquito/sync';
import { mutateCollection } from '../../lib/collections/mutate';
import { tag_items } from '../../lib/collections/tag_items';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { canAttributeWrite, newRecordId, optimisticStamp } from './shared';

export interface RecordTagMutations {
	/** Put a Tag on a record. The id is minted here, which is what makes it replay-safe. */
	readonly assign: (target: TagTarget, tagId: string) => Promise<void>;
	/**
	 * Take a Tag off, by the *link* row's id.
	 *
	 * `unassignTag` never reads the catalog row, so a deactivated Tag comes off
	 * through this same call.
	 */
	readonly unassign: (tagItemId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useRecordTagMutations(): RecordTagMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const assign = async (target: TagTarget, tagId: string) => {
		if (organizationId === null || actorProfileId === null) {
			throw new Error('Your profile is still loading.');
		}

		const now = optimisticStamp();
		await settleWrite(
			mutateCollection(tag_items(), {
				operation: 'insert',
				intent: 'fieldWork.assignTag',
				row: {
					id: newRecordId(),
					organization_id: organizationId,
					tag_id: tagId,
					entity_type: toDbEntityType(target.type),
					entity_id: target.id,
					created_by_profile_id: actorProfileId,
					updated_by_profile_id: actorProfileId,
					created_at: now,
					updated_at: now,
				} satisfies TagItem,
			}),
		);
	};

	const unassign = async (tagItemId: string) => {
		await settleWrite(
			mutateCollection(tag_items(), {
				operation: 'delete',
				intent: 'fieldWork.unassignTag',
				key: tagItemId,
			}),
		);
	};

	return {
		assign,
		unassign,
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	};
}
