/**
 * The sentence a server refusal reads as in the console.
 *
 * A refusal body carries `error`, a machine-readable code, and sometimes
 * `reason`, a sentence written for a person. `responseErrorMessage` in
 * `api.ts` had nothing between the two, so a body with only a code put
 * `operator_required` in a red box (#689). Before #612 it put "operator
 * required" there instead, which is the same code with the underscores taken
 * out and no more of an explanation. So this is a map and never a
 * transformation: a code the console has not thought about gets the caller's
 * fallback sentence, not a prettier spelling of itself.
 *
 * ## Read before `reason`, not after
 *
 * A code in this register beats the `reason` beside it, which is the opposite
 * of what the ordering looks like it should be, and it is deliberate. Three of
 * the refusals below send a `reason` that is itself a code:
 * `toAuthFailureBody` in `apps/server/src/auth-context.ts` copies the error
 * type into `reason` for `organization_required` and `membership_required`,
 * and `unauthenticated` carries WorkOS's own `no_session_cookie_provided`.
 * Preferring `reason` would leave all three on screen, which is the thing this
 * register exists to stop.
 *
 * Nothing is shadowed by that, because of the rule for what goes in: **a code
 * is entered here only when every admin-reachable refusal that sends it sends
 * no sentence with it.** That was checked one code at a time against
 * `apps/server/src`. The refusals that do write a sentence are deliberately
 * absent and keep answering with their own words: `invalid_payload` names the
 * field, `forbidden` names the standing, `reference_refused` names the row,
 * `trap_display_required` says which of the two labels to keep,
 * `workos_identity_writes_disabled` says the deployment refuses identity
 * writes, and the three `invitation_*` 502s carry the copy
 * `invitation-refusal.ts` keeps beside each name.
 *
 * ## How the list was found
 *
 * Every code the console can receive, walked back from the six calls it makes:
 * the four `/admin/*` reads and writes in `api.ts`, and the eight
 * `/foundation/*` and `/adult-surveillance/traps` seed writes
 * `postOrganizationCommand` sends. That is `createOperatorAuthContextMiddleware`
 * and the organization `authContextMiddleware` in `auth-middleware.ts`,
 * `operator-organization-routes.ts`, `admin-foundations.ts`,
 * `admin-invitations.ts` with the `StageOrganizationInvitationErrorCode` union
 * behind it, and `commandEndpoint`'s own refusals in `command-endpoint.ts`.
 *
 * ## What the sentences owe
 *
 * `docs/writing-style.md` and the vocabulary in `CONTEXT.md`. Each says what
 * happened and, where there is one, what the operator does next. Where there is
 * no next move it stops rather than inventing one.
 *
 * The two operator refusals are here as a floor, not as a replacement.
 * `isOperatorRequiredError` and `isOperatorNotConfiguredError` still read the
 * code off the error and their two pages still say more than a toast can; these
 * sentences are what any *other* surface shows when it only has a message.
 */

/** One sentence per code, and no entry that is the code with its shape changed. */
const REFUSAL_MESSAGES: Record<string, string> = {
	already_a_member: 'That person already holds a membership in this organization.',
	invalid_command: 'The server refused these values. Check the form and try again.',
	invited_email_already_used:
		'That email address already has an invitation in this organization. Check the list before sending another.',
	membership_required:
		'This account holds no active membership in that organization. Grant one, then try again.',
	operator_not_configured:
		'This server has no SIMMER organization set, so it can admit no operators. Set SIMMER_OPERATOR_ORG_ID on the server and restart it.',
	operator_required: 'This account is not a SIMMER operator. Sign out and sign in as one.',
	organization_not_found: 'No organization matches that id. Go back to the directory and pick one.',
	organization_required: 'This session has no organization selected. Enter the organization again.',
	profile_already_linked:
		'That profile already belongs to an account. Pick a profile that does not.',
	profile_deleted: 'That profile was deleted. Pick another one.',
	profile_not_found: 'No profile in this organization matches that id. Pick another one.',
	unauthenticated: 'Your session has ended. Sign in again.',
	workos_organization_required:
		'This organization has no WorkOS organization linked, so an invitation cannot be sent. Link it first.',
};

/**
 * The sentence for a refusal code, or `null` when the console has none.
 *
 * `null` rather than the code, so the caller falls back to its own sentence.
 */
export function refusalMessage(code: string | null): string | null {
	if (code === null) {
		return null;
	}
	return REFUSAL_MESSAGES[code] ?? null;
}
