/**
 * Writing the agency's people.
 *
 * A **Profile** is who an agency attributes work to. It may or may not have a
 * login behind it: a historical Profile — a crew member who left before SIMMER,
 * or who never signs in — exists so records can name them, and is created here
 * with no `user_id` at all. Attaching a login is a different act with a
 * different floor, and it happens through an invitation rather than through
 * this.
 *
 * Two operations, and both are commands since ADR 0013's first slice: they were
 * the easiest of the seven identity writes, because each is a plain Postgres
 * write that never touches WorkOS and `createHistorical` already minted its own
 * id. So this is an ordinary `mutateCollection` caller like every other table's.
 *
 * ## A save that changed nothing writes nothing
 *
 * The People page saves a Profile and a role from one sheet, and they are two
 * writes with two floors: editing a Profile is admin, changing a role is owner.
 * An unchanged save has to fire neither, and the role half is the one that can
 * hurt: a role read wrong off the left join and written back is somebody
 * silently demoted by a sheet they opened and closed.
 *
 * So the decision is {@link profileSavePlan}, which is pure and tested rather
 * than spread across the sheet's submit handler. It answers both halves from the
 * same comparison: which columns moved, and whether the role did.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import type { Profile } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { profiles } from '../../lib/collections/profiles';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

/** A Profile as its dialog holds one. */
export interface ProfileFields {
	readonly displayName: string;
	readonly isActive: boolean;
}

/** What the edit sheet holds, which is a Profile and the role beside it. */
export interface ProfileEditValues extends ProfileFields {
	readonly role: SimmerRole;
}

/** The Profile and membership the sheet opened on. */
export interface ProfileEditSubject {
	readonly displayName: string;
	readonly isActive: boolean;
	/** Nullish on a historical Profile: the unmatched side of the membership join. */
	readonly membershipId: string | null | undefined;
	readonly role: SimmerRole | null | undefined;
}

export interface ProfileSavePlan {
	/** The role to grant, or `null` when the role did not move or there is none to move. */
	readonly roleChange: SimmerRole | null;
	/** The columns that moved, empty when none did. */
	readonly changes: Partial<Profile>;
}

/**
 * What one press of Save on the edit sheet means: neither write, one, or both.
 *
 * `membershipId == null` is the historical case, and it answers both questions
 * at once. Nobody signs in as them, so there is no role to change whatever the
 * picker shows. The picker still shows `viewer` for them, which is why comparing
 * the picker to `person.role` alone is not enough: `viewer !== null` is true, and
 * a save would grant a role to a membership that does not exist.
 */
export function profileSavePlan(
	values: ProfileEditValues,
	subject: ProfileEditSubject,
): ProfileSavePlan {
	const changes: Partial<Profile> = {};
	if (values.displayName !== subject.displayName) {
		changes.display_name = values.displayName;
	}
	if (values.isActive !== subject.isActive) {
		changes.is_active = values.isActive;
	}

	const roleMoved = subject.membershipId != null && values.role !== subject.role;
	return { roleChange: roleMoved ? values.role : null, changes };
}

export interface ProfileMutations {
	/** Returns the new Profile's id, so a caller can select or scroll to it. */
	readonly createHistorical: (fields: ProfileFields) => Promise<string>;
	/**
	 * Save the columns that moved. `changes` comes from {@link profileSavePlan};
	 * an empty one sends nothing.
	 */
	readonly save: (id: string, changes: Partial<Profile>) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useProfileMutations(): ProfileMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;

	const createHistorical = useCallback(
		async (fields: ProfileFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			const row = {
				id: newRecordId(),
				organization_id: organizationId,
				// No login, which is what makes it historical. An invitation is what
				// attaches one, and it is a separate floor and a separate route.
				user_id: null,
				display_name: fields.displayName,
				email: null,
				is_active: fields.isActive,
				created_at: now,
				updated_at: now,
			} satisfies Profile;

			await settleWrite(
				mutateCollection(profiles(), {
					operation: 'insert',
					intent: 'identity.createProfile',
					row,
				}),
			);

			return row.id;
		},
		[organizationId],
	);

	const save = useCallback(async (id: string, changes: Partial<Profile>) => {
		// Nothing moved, so there is nothing to name. `updateProfile` with an empty
		// change set is refused by the domain, and stamping `updated_at` to give the
		// diff something to carry would only turn a no-op into a write.
		if (Object.keys(changes).length === 0) {
			return;
		}

		await settleWrite(
			mutateCollection(profiles(), {
				operation: 'update',
				intent: 'identity.updateProfile',
				key: id,
				changes,
			}),
		);
	}, []);

	return { createHistorical, save, canWrite: organizationId !== null };
}
