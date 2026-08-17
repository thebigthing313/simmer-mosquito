/**
 * Attaching and detaching the crew who worked a record.
 *
 * A link row carries nothing of its own — a Profile either worked the record or
 * did not — so there is no edit, and a form that changes the crew is an add and
 * a remove. Both are ordinary single-row commands; nothing here needs a
 * transaction, because the parent record already exists by the time a crew row
 * can reference it.
 *
 * `entity_type` is written in the column's own snake_case spelling rather than
 * the domain's, so the optimistic row and the row Electric streams back are the
 * same row — see `use-additional-personnel.ts` for what that fixes on the read
 * side. The server converts it back before the command is built.
 */

import { toDbEntityType } from '@simmer-mosquito/domain';
import {
	type AdditionalPersonnel as AdditionalPersonnelRow,
	settleWrite,
} from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { additional_personnel } from '../../lib/collections/additional_personnel';
import { mutateCollection } from '../../lib/collections/mutate';
import { reconcileLinks } from '../../sync/reconcile-links';
import type {
	AdditionalPersonnelLink,
	AdditionalPersonnelTarget,
} from '../queries/use-additional-personnel';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

export interface SetAdditionalPersonnelInput {
	readonly target: AdditionalPersonnelTarget;
	/** Who is attached now — empty when the record was just created. */
	readonly existing: readonly AdditionalPersonnelLink[];
	/** Who the form says should be attached. */
	readonly profileIds: readonly string[];
}

export interface AdditionalPersonnelMutations {
	readonly attach: (target: AdditionalPersonnelTarget, personnelProfileId: string) => Promise<void>;
	/** By the *link* row's id, which is also how the server reaches the record it hangs off. */
	readonly detach: (additionalPersonnelId: string) => Promise<void>;
	/** Both of the above, until the crew matches a selection. What a form saves. */
	readonly setPersonnel: (input: SetAdditionalPersonnelInput) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useAdditionalPersonnelMutations(): AdditionalPersonnelMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const attach = useCallback(
		async (target: AdditionalPersonnelTarget, personnelProfileId: string) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(additional_personnel, {
					operation: 'insert',
					intent: 'fieldWork.addAdditionalPersonnel',
					row: {
						id: newRecordId(),
						organization_id: organizationId,
						personnel_profile_id: personnelProfileId,
						entity_type: toDbEntityType(target.type),
						entity_id: target.id,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies AdditionalPersonnelRow,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const detach = useCallback(async (additionalPersonnelId: string) => {
		await settleWrite(
			mutateCollection(additional_personnel, {
				operation: 'delete',
				intent: 'fieldWork.removeAdditionalPersonnel',
				key: additionalPersonnelId,
			}),
		);
	}, []);

	const setPersonnel = useCallback(
		async ({ target, existing, profileIds }: SetAdditionalPersonnelInput) => {
			const { removals, additions } = reconcileLinks(
				existing,
				(row) => row.personnelProfileId,
				profileIds,
			);

			// Concurrently: these are independent rows, and each is its own command, so
			// there is no order for them to be in.
			await Promise.all([
				...removals.map((row) => detach(row.id)),
				...additions.map((personnelProfileId) => attach(target, personnelProfileId)),
			]);
		},
		[attach, detach],
	);

	return {
		attach,
		detach,
		setPersonnel,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
