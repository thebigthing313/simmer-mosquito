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
 * It answers `null` rather than throwing. The mail is out and the row exists, so
 * the invitation did happen, and a 500 would tell the caller it did not. The
 * obvious next move after that 500 is to invite again, which collides with the
 * row already there. The only thing lost is the id, and the log line carries it.
 *
 * `null` is also an answer a caller can act on rather than only a shrug.
 * `identity.reinvite` revokes the link it replaced *after* stamping the one that
 * replaces it, and skips the revoke when this answers `null`: the row still
 * names the old invitation, so killing it would leave the Membership pointing at
 * a dead link with the live one recorded nowhere.
 *
 * Every invite path calls this, and none should grow its own copy.
 */
export async function stampInvitation(
	db: StampDb,
	input: {
		readonly membershipId: string;
		readonly organizationId: string;
		readonly workosInvitationId: string;
	},
): Promise<SafeOrganizationMembership | null> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= STAMP_ATTEMPTS; attempt += 1) {
		try {
			return await stampOrganizationInvitation(db, {
				id: input.membershipId,
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
		`[invitations] Stamp failed ${STAMP_ATTEMPTS} times. WorkOS invitation ${input.workosInvitationId} is live and recorded nowhere. Membership ${input.membershipId}, organization ${input.organizationId}.`,
		lastError,
	);

	return null;
}
