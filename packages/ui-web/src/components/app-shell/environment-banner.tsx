import { AlertTriangleIcon } from '../../icons/registry';
import { isStagingEnvironment } from '../../lib/environment';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

/**
 * The strip that names a non-production deployment, above both rails so it is
 * the first thing on screen and cannot be scrolled away.
 *
 * Staging shows agency staff a clone of their own data, running code that has
 * not shipped, on a database the next refresh replaces. Two failures follow from
 * a user who does not know that: a staging bug filed as a production support
 * ticket, and an afternoon of real work typed into a copy. Neither is fixable
 * afterwards, so the banner is not dismissible.
 *
 * The refusal sentence repeats what the server answers with. Staging performs no
 * WorkOS identity writes, so those commands return 403
 * `workos_identity_writes_disabled` with this wording (ADR 0013, issue #376). A
 * user meets that message with a half-filled invitation form in front of them.
 * Reading the same sentence up here first is what makes it a rule rather than a
 * bug.
 */

const REFUSAL =
	'Staging does not allow changes to sign-in accounts, Memberships, roles, Agencies, or invitations.';

export function EnvironmentBanner({ environment }: { readonly environment: string | undefined }) {
	if (!isStagingEnvironment(environment)) {
		return null;
	}

	return (
		<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-attention px-4 py-2 text-sm text-warning">
			<AlertTriangleIcon aria-hidden className="size-4 shrink-0" />
			<span className="font-semibold">Staging</span>
			<span>A copy of your live data. Changes here are erased on the next refresh.</span>
			<Popover>
				<PopoverTrigger className="rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning">
					What is different here
				</PopoverTrigger>
				<PopoverContent align="start" className="text-sm">
					{REFUSAL}
				</PopoverContent>
			</Popover>
		</div>
	);
}
