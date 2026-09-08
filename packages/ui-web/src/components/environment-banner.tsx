import type React from 'react';
import { AlertTriangleIcon } from '../icons/registry';
import { isStagingEnvironment } from '../lib/environment';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

/**
 * The strip that names a non-production deployment, above everything else on the
 * page so it is the first thing on screen and cannot be scrolled away.
 *
 * Staging shows organization staff a clone of their own data, running code that
 * has not shipped, on a database the next refresh replaces. Two failures follow
 * from a user who does not know that: a staging bug filed as a production
 * support ticket, and an afternoon of real work typed into a copy. Neither is
 * fixable afterwards, so the banner is not dismissible.
 *
 * The refusal sentence repeats what the server answers with. Staging performs no
 * WorkOS identity writes, so those commands return 403
 * `workos_identity_writes_disabled` with this wording (ADR 0017, issue #376). A
 * user meets that message with a half-filled invitation form in front of them.
 * Reading the same sentence up here first is what makes it a rule rather than a
 * bug.
 *
 * Two banners, because the two audiences have met different amounts of the
 * product, and one strip. This file sits under `components/` rather than
 * `components/app-shell/` because the signed-out pages are not the shell, and
 * importing the banner through the shell barrel would pull the rails and the
 * header into the sign-in bundle.
 */

/**
 * `WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE` in
 * `apps/server/src/workos-identity-interlock.ts`, word for word.
 *
 * One string for both banners, so the sentence a user reads here is the sentence
 * the 403 answers with (#376's one-message rule). It is a mirror rather than an
 * import because a browser package cannot reach into the server.
 */
const REFUSAL =
	'Staging does not allow changes to sign-in accounts, Memberships, roles, Organizations, or invitations.';

/** The chrome both banners share: the fill, the icon, the environment name. */
function EnvironmentStrip({
	summary,
	children,
}: {
	readonly summary: string;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-attention px-4 py-2 text-sm text-warning">
			<AlertTriangleIcon aria-hidden className="size-4 shrink-0" />
			<span className="font-semibold">Staging</span>
			<span>{summary}</span>
			<Popover>
				<PopoverTrigger className="rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning">
					What is different here
				</PopoverTrigger>
				<PopoverContent align="start" className="grid gap-2 text-sm">
					{children}
				</PopoverContent>
			</Popover>
		</div>
	);
}

/** The strip above both rails, for a user who is already signed in. */
export function EnvironmentBanner({ environment }: { readonly environment: string | undefined }) {
	if (!isStagingEnvironment(environment)) {
		return null;
	}

	return (
		<EnvironmentStrip summary="A copy of your live data. Changes here are erased on the next refresh.">
			<p className="m-0">{REFUSAL}</p>
		</EnvironmentStrip>
	);
}

/**
 * The strip above the signed-out pages: `/landing`, the five auth routes, and
 * the operator console's sign-in.
 *
 * Different copy for the same rule. "Your live data" is wrong for someone who
 * has not signed in yet and, on `/sign-up`, never will, so the strip names the
 * system rather than the reader's data.
 *
 * The popover leads with the sentence #408 was opened about. Staging
 * authenticates against WorkOS production (ADR 0017), so real credentials work
 * here and nothing on the page says so; a user can sign in believing they are in
 * production. The refusal follows unchanged, because four of the six signed-out
 * routes — sign-up, accept-invitation, forgot-password, reset-password — are
 * surfaces the interlock refuses, and until now that sentence was shown only to
 * users already past the pages that fire it.
 */
export function SignedOutEnvironmentBanner({
	environment,
}: {
	readonly environment: string | undefined;
}) {
	if (!isStagingEnvironment(environment)) {
		return null;
	}

	return (
		<EnvironmentStrip summary="A copy of the production system. Anything you change here is erased on the next refresh.">
			<p className="m-0">Your sign-in details are your real production ones.</p>
			<p className="m-0">{REFUSAL}</p>
		</EnvironmentStrip>
	);
}
