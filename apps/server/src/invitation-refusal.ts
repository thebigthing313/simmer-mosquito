/**
 * A failed invitation send, named by this server rather than by WorkOS.
 *
 * Both invite paths used to answer `reason: error.message`, which put a string
 * WorkOS writes into a browser (#220). Nothing in this repo decides what is in
 * it. The one seen on staging was `Email already invited to organization.` and
 * was harmless; the next could carry an internal id, an address belonging to
 * another agency, or the shape of the account structure.
 *
 * So the raw message goes to the log and the caller gets one of three names.
 * The split is read from the HTTP status WorkOS answered with, the same thing
 * `isSettledInvitationRefusal` in `packages/auth` reads, because a status is a
 * fact about the exchange and the prose is not. Parsing the prose to tell
 * "already invited" from "already a member" would put this module back in the
 * business of trusting a third party's wording.
 *
 * Three names because there are three different next moves: look at the person,
 * try again later, or stop trying. Anything finer would be guessed.
 */

/**
 * The `error` code on a 502 from an invitation send.
 *
 * `reason` beside it is the sentence a person reads: `apps/web`'s
 * `saveFailureMessage` and `apps/admin`'s `api.ts` both render the server's
 * `reason` verbatim, so these strings are UI copy and are written as such.
 */
export type InvitationRefusalCode =
	| 'invitation_refused'
	| 'invitation_service_unauthorized'
	| 'invitation_service_unavailable';

export interface InvitationRefusal {
	readonly error: InvitationRefusalCode;
	readonly reason: string;
}

/**
 * Name a failed send and log what WorkOS actually said.
 *
 * The ids are the log's, not the caller's. An operator reading the line needs
 * the row and the agency to find the person; the caller already knows which
 * invitation it asked for, and the address is the half worth keeping out of a
 * response body.
 */
export function refuseInvitationSend(
	error: unknown,
	attempt: { readonly membershipId: string; readonly organizationId: string },
): InvitationRefusal {
	const refusal = nameRefusal(error);

	console.error(
		`[invitations] Send refused as ${refusal.error}. Membership ${attempt.membershipId}, organization ${attempt.organizationId}.`,
		error,
	);

	return refusal;
}

/** The sentence each name shows a person, kept beside the name it belongs to. */
const REFUSAL_REASONS: Record<InvitationRefusalCode, string> = {
	// Postgres already refuses the two cases the People page can see, so what
	// reaches here is drift: an invitation or a membership WorkOS holds and
	// SIMMER has no row for. Hence "check", which is the move that finds it.
	invitation_refused:
		'That address cannot be invited. Check whether they already have access or an invitation.',
	invitation_service_unauthorized:
		'The invitation could not be sent, and trying again will not help.',
	invitation_service_unavailable: 'The invitation could not be sent. Try again shortly.',
};

function nameRefusal(error: unknown): InvitationRefusal {
	const code = classify(statusOf(error));
	return { error: code, reason: REFUSAL_REASONS[code] };
}

function classify(status: number | null): InvitationRefusalCode {
	// No status at all is a request that never got an answer: a DNS failure, a
	// timeout, a dropped connection. WorkOS did not refuse it, so it is worth
	// retrying. A 2xx that threw is a broken client and lands here too, because
	// the service is unusable rather than the address unwelcome.
	if (status === null || status < 400 || status === 429 || status >= 500) {
		return 'invitation_service_unavailable';
	}

	// SIMMER's own credentials, or an agency wired to a WorkOS organization it
	// cannot write to. The person clicking Invite can do nothing about either,
	// and a retry reproduces it exactly.
	if (status === 401 || status === 403) {
		return 'invitation_service_unauthorized';
	}

	return 'invitation_refused';
}

function statusOf(error: unknown): number | null {
	const status = (error as { readonly status?: unknown } | null)?.status;
	return typeof status === 'number' ? status : null;
}
