import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessageForSave } from '../../lib/save-error';

export interface CommandRunner {
	/** A write is in flight; the page disables its controls rather than queueing. */
	readonly busy: boolean;
	/** Runs the write; `fallback` is what the toast says when the failure carries no sentence. */
	readonly run: (work: () => Promise<void>, fallback: string) => Promise<void>;
}

/**
 * One gate over every lifecycle write on the operations pages: a busy flag
 * while a write is in flight, and a toast reporting a refusal with the server's
 * sentence or the caller's `fallback`.
 */
export function useCommandRunner(): CommandRunner {
	const [busy, setBusy] = useState(false);

	const run = async (work: () => Promise<void>, fallback: string) => {
		setBusy(true);
		try {
			await work();
		} catch (cause) {
			toast.error(errorMessageForSave(cause, fallback));
		}
		setBusy(false);
	};

	return { busy, run };
}
