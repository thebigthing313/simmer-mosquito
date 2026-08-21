import { type SafeOrganizationMembership, stampOrganizationInvitation } from '@simmer-mosquito/db';

type StampDb = Parameters<typeof stampOrganizationInvitation>[0];

type StampOutcome =
	| { readonly ok: true; readonly membership: SafeOrganizationMembership }
	| { readonly ok: false };

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
 * Both invite routes call this, and neither should grow its own copy.
 */
export async function stampInvitation(
	db: StampDb,
	input: {
		readonly membershipId: string;
		readonly organizationId: string;
		readonly workosInvitationId: string;
	},
): Promise<StampOutcome> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= STAMP_ATTEMPTS; attempt += 1) {
		try {
			const membership = await stampOrganizationInvitation(db, {
				id: input.membershipId,
				organizationId: input.organizationId,
				workosInvitationId: input.workosInvitationId,
			});

			return { ok: true, membership };
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

	return { ok: false };
}
