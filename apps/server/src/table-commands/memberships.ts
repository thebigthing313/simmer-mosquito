/**
 * `/commands/memberships`: who may sign in to this organization, and as what.
 *
 * The four commands ADR 0013 left until last, and the only table on the surface
 * whose writes are not finished when the transaction commits. WorkOS holds the
 * grant a session is refreshed against, so `run.secondSystem` carries the halves
 * that run outside it — see `membership-commands.ts` for which half runs on which
 * side and why.
 *
 * ## Which verb means what
 *
 * `identity.invite` is the POST, and the `id` it writes is the one the client
 * minted and sent. The other three are PATCHes, `identity.endMembership`
 * included: ending access sets `status` to `inactive` rather than removing the
 * row, so an optimistic delete would take a person off the People page and sync
 * would put them straight back. The row surviving is the point — it is the only
 * record that access was ever held.
 *
 * ## Field names
 *
 * `invited_email` is a column of `memberships` that no client receives; the
 * invite dialog supplies it and this is the request that writes it. `display_name`
 * is a column of `profiles`: an invitation names the Profile it creates or
 * attaches to, and the two rows are written in one transaction.
 *
 * `identity.endMembership` takes no fields at all. The `status` and `is_default`
 * a client sends with it are what move its optimistic row; the server writes both
 * itself, from the command's name.
 */

import type { MembershipCommand, SimmerRole } from '@simmer-mosquito/domain';
import {
	changeRoleCommand,
	endMembershipCommand,
	inviteCommand,
	reinviteCommand,
	SIMMER_ROLES,
} from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import {
	type MembershipAuth,
	type MembershipRow,
	membershipSecondSystem,
	writeMembershipCommand,
} from '../membership-commands.js';
import type { TableCommands } from './dispatch.js';

/**
 * The name on the `profiles` row an invitation creates or attaches to. A column,
 * just not this table's.
 */
type MembershipArgument = 'display_name';

export function membershipTableCommands(
	db: CommandDb,
	auth: MembershipAuth,
): TableCommands<'memberships', MembershipCommand, MembershipRow, MembershipArgument> {
	return {
		table: 'memberships',
		run: {
			db,
			write: writeMembershipCommand,
			notFound: 'membership_not_found',
			key: 'membership',
			secondSystem: membershipSecondSystem(db, auth),
		},
		intents: {
			'identity.invite': ({ payload, organization, id }) =>
				inviteCommand({
					...organization,
					membershipId: id,
					profileId: readText(payload.profile_id) ?? '',
					invitedEmail: readText(payload.invited_email) ?? '',
					displayName: readText(payload.display_name),
					role: readRole(payload.role),
				}),
			'identity.reinvite': ({ payload, organization, id }) =>
				reinviteCommand({ ...organization, membershipId: id, role: readRole(payload.role) }),
			'identity.changeRole': ({ payload, organization, id }) =>
				changeRoleCommand({ ...organization, membershipId: id, role: readRole(payload.role) }),
			'identity.endMembership': ({ organization, id }) =>
				endMembershipCommand({ ...organization, membershipId: id }),
		},
	};
}

/**
 * A role off an untrusted body.
 *
 * Anything that is not one of the five becomes `undefined`, which the builder
 * refuses by name. Casting the raw value instead would hand the domain a
 * `SimmerRole` it is not, and the refusal would arrive from Postgres as an enum
 * error rather than as the 400 it is.
 */
function readRole(value: unknown): SimmerRole | undefined {
	return typeof value === 'string' && SIMMER_ROLES.includes(value as SimmerRole)
		? (value as SimmerRole)
		: undefined;
}
