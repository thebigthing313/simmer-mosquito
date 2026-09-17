import { useState } from 'react';
import { toast } from 'sonner';

export interface CommandRunner {
	/** A write is in flight; the page disables its controls rather than queueing. */
	readonly busy: boolean;
	readonly run: (work: () => Promise<void>, fallback: string) => Promise<void>;
}

/**
 * One gate over every lifecycle write on the operations pages.
 *
 * The two worklists and the request page send lifecycle commands that the server refuses on their
 * preconditions, and a refusal arrives as prose worth showing rather than a
 * fault — "Some stops are still pending" is an answer, not an error. So every
 * write goes through here: one busy flag, one report.
 *
 * The report is a toast, the way `RecordDeleteDialog` and the record header
 * menu report a refusal (#1100). It used to be a string the page drew in a
 * destructive `Alert`, which put the three pages alone among the record
 * pages in where a refused start, complete, cancel or reopen landed.
 * The message is the server's sentence when the thrown error carries one and
 * the caller's `fallback` when it does not, which is what the service request
 * header does. A form keeps its refusal in-page, because a form is something
 * the person can fix and resubmit; `DetailPageHeader`'s docblock carries the
 * rule, and `AddMissionStopForm` is the caller that left this hook over it.
 */
export function useCommandRunner(): CommandRunner {
	const [busy, setBusy] = useState(false);

	const run = async (work: () => Promise<void>, fallback: string) => {
		setBusy(true);
		try {
			await work();
		} catch (cause) {
			toast.error(cause instanceof Error ? cause.message : fallback);
		}
		setBusy(false);
	};

	return { busy, run };
}
