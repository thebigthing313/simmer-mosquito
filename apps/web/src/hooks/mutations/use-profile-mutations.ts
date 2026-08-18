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
 * Two operations, and neither is a command *yet*. ADR 0013 folds identity into
 * the command vocabulary, and these two are the easiest of the seven: both are
 * plain Postgres writes that never touch WorkOS, and `createHistorical` already
 * mints its own id. They move first, and this hook becomes an ordinary
 * `mutateCollection` caller like every other.
 *
 * Until then they go to `/organization/profiles` through `rest-writes.ts` — read
 * that module for why a write to this table cannot currently go through the
 * collection's own handlers.
 *
 * ## The field names are camelCase, and deliberately
 *
 * Everywhere else on this seam the body is keyed by Postgres column name,
 * because the server builds a domain command out of it and the column list is
 * what both sides agree on. These two routes predate that and read
 * `displayName`/`isActive` — they are not command endpoints and have no builder
 * to feed. The row written optimistically is still snake_case, because that is
 * what the collection holds; the boundary is the request body alone.
 *
 * The fold fixes this too: a command body is columns, so these two names go with
 * the routes that read them.
 */

import type { Profile } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { getServerUrl } from '../../auth';
import { profiles } from '../../lib/collections/profiles';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { writeThroughRest } from './rest-writes';
import { newRecordId, optimisticStamp } from './shared';

/** A Profile as its dialog holds one. */
export interface ProfileFields {
	readonly displayName: string;
	readonly isActive: boolean;
}

export interface ProfileMutations {
	/** Returns the new Profile's id, so a caller can select or scroll to it. */
	readonly createHistorical: (fields: ProfileFields) => Promise<string>;
	readonly save: (id: string, fields: ProfileFields) => Promise<void>;
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

			await writeThroughRest({
				collection: profiles,
				url: `${getServerUrl()}/organization/profiles`,
				method: 'POST',
				body: { id: row.id, displayName: fields.displayName, isActive: fields.isActive },
				apply: () => {
					profiles.insert(row);
				},
				fallback: 'Unable to add this profile.',
			});

			return row.id;
		},
		[organizationId],
	);

	const save = useCallback(async (id: string, fields: ProfileFields) => {
		await writeThroughRest({
			collection: profiles,
			url: `${getServerUrl()}/organization/profiles/${id}`,
			method: 'PATCH',
			body: { id, displayName: fields.displayName, isActive: fields.isActive },
			apply: () => {
				profiles.update(id, (draft) => {
					draft.display_name = fields.displayName;
					draft.is_active = fields.isActive;
				});
			},
			fallback: 'Unable to save this profile.',
		});
	}, []);

	return { createHistorical, save, canWrite: organizationId !== null };
}
