import type { ReactNode } from 'react';
import { useHasRole } from '../hooks/use-can-write';
import type { MinimumRole } from '../lib/write-access';

/**
 * Renders its children only for roles that may perform the write behind them.
 *
 * Wraps the controls that start a write — create buttons, Edit links, inline
 * add forms. Viewers get the record, not the pencil: hiding rather than
 * disabling, because a disabled Edit button asks the reader to work out why on
 * every page forever, when the answer is a fact about their account rather than
 * about the record in front of them.
 *
 * `minimum` raises the bar past the default read-only line for controls whose
 * command needs more than field entry: `manager` for planning and the shared
 * catalogs, `admin` for the ones that configure the agency. It should match the
 * floor in `apps/server/src/command-permissions.ts` for the command the control
 * sends — a control shown below its floor is a form the user can fill in and
 * not save.
 *
 * This is presentation only. The forms themselves are closed by the route
 * guards in `lib/write-access`, and the server authorizes every command
 * regardless — so a control that slips through here is a cosmetic bug, not a
 * hole.
 */
export function WriteOnly({
	children,
	minimum = 'collector',
}: {
	readonly children: ReactNode;
	readonly minimum?: MinimumRole;
}) {
	return useHasRole(minimum) ? children : null;
}
