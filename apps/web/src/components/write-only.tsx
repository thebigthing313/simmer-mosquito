import type { ReactNode } from 'react';
import { useCanWrite } from '../hooks/use-can-write';

/**
 * Renders its children only for roles that can record work.
 *
 * Wraps the controls that start a write — create buttons, Edit links, inline
 * add forms. Viewers get the record, not the pencil: hiding rather than
 * disabling, because a disabled Edit button asks the reader to work out why on
 * every page forever, when the answer is a fact about their account rather than
 * about the record in front of them.
 *
 * This is presentation only. The forms themselves are closed to viewers by the
 * route guards in `lib/write-access`, and the server authorizes every command
 * regardless — so a control that slips through here is a cosmetic bug, not a
 * hole.
 */
export function WriteOnly({ children }: { readonly children: ReactNode }) {
	return useCanWrite() ? children : null;
}
