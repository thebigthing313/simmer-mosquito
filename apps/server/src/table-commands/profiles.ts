/**
 * `/commands/profiles`: the agency's people, minus their logins.
 *
 * A Profile created here is **historical**: somebody the agency attributes work
 * to with no login behind it. Attaching a login is an invitation, which spans
 * WorkOS and is slice 3's; ending one is `people.endMembership`, also slice 3.
 * So this module writes two columns and never touches `memberships`.
 *
 * There is no delete. A Profile is what records name, and the way to stop one
 * being offered is `is_active`, which `identity.updateProfile` writes.
 *
 * ## Field names
 *
 * Every key is a column of `profiles`. The routes this replaces read
 * `displayName` and `isActive`, which is the camelCase body that predates the
 * per-table surface.
 */

import type { IdentityCommand } from '@simmer-mosquito/domain';
import { createProfileCommand, updateProfileCommand } from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { type IdentityRow, writeIdentityCommand } from '../identity-commands.js';
import type { TableCommands } from './dispatch.js';

export function profileTableCommands(
	db: CommandDb,
): TableCommands<'profiles', IdentityCommand, IdentityRow> {
	return {
		table: 'profiles',
		run: { db, write: writeIdentityCommand, notFound: 'profile_not_found', key: 'profile' },
		intents: {
			'identity.createProfile': ({ payload, agency, id }) =>
				createProfileCommand({
					...agency,
					profileId: id,
					displayName: readText(payload.display_name) ?? '',
					isActive: payload.is_active !== false,
				}),
			'identity.updateProfile': ({ payload, agency, id }) =>
				updateProfileCommand({
					...agency,
					profileId: id,
					...(payload.display_name !== undefined
						? { displayName: readText(payload.display_name) ?? '' }
						: {}),
					...(payload.is_active !== undefined ? { isActive: payload.is_active === true } : {}),
				}),
		},
	};
}
