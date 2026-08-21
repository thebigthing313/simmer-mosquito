import { type SafeOrganizationMembership, stampOrganizationInvitation } from '@simmer-mosquito/db';

type StampDb = Parameters<typeof stampOrganizationInvitation>[0];

const STAMP_ATTEMPTS = 2;

/**
 * The second half of an invitation, attempted twice and never left silent.
 *
 * By the time this runs WorkOS has mailed a working link, so a lost
 * `workos_invitation_id` is an invitation nobody can revoke: `identity.reinvite`
 * reads that column to revoke the invitation it replaces. One retry covers a
 * connection blip, which is the failure worth spending a second attempt on.
 * `executeTakeFirstOrThrow` finding no row is a bug, and a retry reproduces it
 * exactly, so the log line is what makes the id recoverable by hand.
 *
 * It hands back the Membership as staged rather than throwing. The mail is out
 * and the row exists, so the invitation did happen, and a 500 would tell the
 * caller it did not. The obvious next move after that 500 is to invite again,
 * which collides with the row already there. The only thing lost is the id, and
 * the log line carries it.
 *
 * Both invite routes call this, and neither should grow its own copy.
 */
export async function stampInvitation(
	db: StampDb,
	input: {
		readonly staged: SafeOrganizationMembership;
		readonly organizationId: string;
		readonly workosInvitationId: string;
	},
): Promise<SafeOrganizationMembership> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= STAMP_ATTEMPTS; attempt += 1) {
		try {
			return await stampOrganizationInvitation(db, {
				id: input.staged.id,
				organizationId: input.organizationId,
				workosInvitationId: input.workosInvitationId,
			});
		} catch (error) {
			lastError = error;
		}
	}

	// The one place the id still exists. An operator reads this to stamp the row
	// by hand or to revoke the invitation in WorkOS.
	console.error(
		`[invitations] Stamp failed ${STAMP_ATTEMPTS} times. WorkOS invitation ${input.workosInvitationId} is live and recorded nowhere. Membership ${input.staged.id}, organization ${input.organizationId}.`,
		lastError,
	);

	return input.staged;
}
