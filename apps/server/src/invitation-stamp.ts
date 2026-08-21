/**
 * The `workos_invitation_id` column, written from outside a transaction.
 *
 * Both writes here follow a WorkOS call that has already landed, so neither can
 * be undone by failing. Two attempts each, then a log line carrying every id an
 * operator needs to finish the job by hand. One retry covers a connection blip,
 * which is the failure worth spending a second attempt on;
 * `executeTakeFirstOrThrow` finding no row is a bug, and a retry reproduces it
 * exactly.
 */

import {
	clearOrganizationInvitationStamp,
	type SafeOrganizationMembership,
	stampOrganizationInvitation,
} from '@simmer-mosquito/db';

type StampDb = Parameters<typeof stampOrganizationInvitation>[0];

const STAMP_ATTEMPTS = 2;

/**
 * The second half of an invitation.
 *
 * By the time this runs WorkOS has mailed a working link, so a lost
 * `workos_invitation_id` is an invitation nobody can revoke: `identity.reinvite`
 * reads that column to revoke the invitation it replaces.
 *
 * It answers `null` rather than throwing. The mail is out and the row exists, so
 * the invitation did happen, and a 500 would tell the caller it did not. The
 * obvious next move after that 500 is to invite again, which collides with the
 * row already there. The only thing lost is the id, and the log line carries it.
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
	const attempt = await twice(() =>
		stampOrganizationInvitation(db, {
			id: input.membershipId,
			organizationId: input.organizationId,
			workosInvitationId: input.workosInvitationId,
		}),
	);
	if (attempt.ok) {
		return attempt.value;
	}

	// The one place the id still exists. An operator reads this to stamp the row
	// by hand or to revoke the invitation in WorkOS.
	console.error(
		`[invitations] Stamp failed ${STAMP_ATTEMPTS} times. WorkOS invitation ${input.workosInvitationId} is live and recorded nowhere. Membership ${input.membershipId}, organization ${input.organizationId}.`,
		attempt.error,
	);

	return null;
}

/**
 * Drop the id of an invitation WorkOS no longer holds.
 *
 * `identity.reinvite` revokes before it sends, so the row names a dead link from
 * the moment the revoke answers. Clearing it is what makes the Membership agree
 * with WorkOS if the send then fails, and it is what makes the retry work: the
 * next re-invitation reads no id, finds nothing to revoke, and sends.
 *
 * Like the stamp, a failure here is logged rather than thrown. The revoke is
 * done and cannot be taken back, and a retry that finds the stale id revokes an
 * invitation WorkOS has already settled, which answers `already_settled` rather
 * than failing. So the row heals itself on the next attempt, and the log line is
 * for the operator who does not get one.
 */
export async function forgetInvitation(
	db: StampDb,
	input: {
		readonly membershipId: string;
		readonly organizationId: string;
		readonly revokedInvitationId: string;
	},
): Promise<void> {
	const attempt = await twice(() =>
		clearOrganizationInvitationStamp(db, {
			id: input.membershipId,
			organizationId: input.organizationId,
		}),
	);
	if (attempt.ok) {
		return;
	}

	console.error(
		`[invitations] Clearing the stamp failed ${STAMP_ATTEMPTS} times. WorkOS invitation ${input.revokedInvitationId} is revoked and the row still names it. Membership ${input.membershipId}, organization ${input.organizationId}.`,
		attempt.error,
	);
}

type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: unknown };

/** Run a write twice before giving up on it, and hand back what it did. */
async function twice<T>(write: () => Promise<T>): Promise<Attempt<T>> {
	let error: unknown;

	for (let attempt = 1; attempt <= STAMP_ATTEMPTS; attempt += 1) {
		try {
			return { ok: true, value: await write() };
		} catch (thrown) {
			error = thrown;
		}
	}

	return { ok: false, error };
}
