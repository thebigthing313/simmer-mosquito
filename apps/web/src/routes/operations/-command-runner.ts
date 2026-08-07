import { useCallback, useState } from 'react';

export interface CommandRunner {
	/** A write is in flight; the page disables its controls rather than queueing. */
	readonly busy: boolean;
	readonly error: string | null;
	readonly run: (work: () => Promise<void>, fallback: string) => Promise<void>;
}

/**
 * One gate over every write on a worklist page.
 *
 * Both worklists send lifecycle commands that the server refuses on their
 * preconditions, and a refusal arrives as prose worth showing rather than a
 * fault — "Some stops are still pending" is an answer, not an error. So every
 * write goes through here: one busy flag, one message, one banner.
 */
export function useCommandRunner(): CommandRunner {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const run = useCallback(async (work: () => Promise<void>, fallback: string) => {
		setBusy(true);
		setError(null);
		try {
			await work();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : fallback);
		} finally {
			setBusy(false);
		}
	}, []);

	return { busy, error, run };
}
