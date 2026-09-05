/**
 * The one identity surface that never becomes a command.
 *
 * `POST /organization/memberships/list` is a read behind a POST, and reads have
 * never been commands. Everything else this module used to hold — changing a
 * role, ending a membership, inviting somebody — is `identity.*` on
 * `/commands/memberships` since ADR 0013's third slice.
 *
 * Its floor is written out here rather than read from a table. `IDENTITY_FLOORS`
 * existed to hold seven of these and had a hole the command map does not: nothing
 * forced a route to consult it. One route left is not worth a table, and a role
 * check three lines from the handler it guards is the smaller promise, honestly
 * kept.
 *
 * Nothing in `apps/web` calls this. The People page reads its people from the
 * `profiles` and `memberships` collections over sync.
 */

import { listOrganizationMemberships, type SafeOrganizationMembership } from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { forbidden, hasAtLeastRole } from './roles.js';

type ProfileCommandDb = Parameters<typeof listOrganizationMemberships>[0];

export function registerProfileCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ProfileCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/organization/memberships/list', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		// The people floor: an organization delegates onboarding, so admin rather
		// than owner. The same rung `identity.invite` and `identity.endMembership`
		// carry in `COMMAND_PERMISSIONS`.
		if (!hasAtLeastRole(authContext.role, 'admin')) {
			return context.json(forbidden('Only organization owners and admins can manage people.'), 403);
		}

		const memberships = await listOrganizationMemberships(options.db, authContext.organization.id);

		return context.json({ memberships: memberships.map(toMembershipResponse) });
	});
}

function toMembershipResponse(membership: SafeOrganizationMembership) {
	return {
		id: membership.id,
		organizationId: membership.organizationId,
		userId: membership.userId,
		profileId: membership.profileId,
		role: membership.role,
		status: membership.status,
		isDefault: membership.isDefault,
		invitedEmail: membership.invitedEmail,
		workosInvitationId: membership.workosInvitationId,
		profile: membership.profile,
		createdAt: membership.createdAt,
		updatedAt: membership.updatedAt,
	};
}
