import { toast } from 'sonner';
import {
	errorMessageForSave,
	watchPersistence,
} from '../../routes/my-organization/-components/helpers';
import type { PersistenceTransaction } from '../../routes/my-organization/-components/types';

/**
 * Make a catalog write, dismiss the surface that made it, and watch it land.
 *
 * Every catalog wrote these three steps itself and always in the same order: a
 * builder that throws on a bad value becomes a toast, a write that the server
 * later rejects becomes `failureMessage`, and the dialog or drawer closes in
 * between — optimistically, because the row is already on screen by then.
 *
 * `write` is the only part that differs, because only the page knows which
 * command carries the record.
 */
/**
 * Make a catalog write, dismiss the surface that made it, and watch it land.
 *
 * Every catalog wrote these three steps itself and always in the same order: a
 * builder that throws on a bad value becomes a toast, a write the server later
 * rejects becomes `failureMessage`, and the dialog or drawer closes in between —
 * optimistically, because the row is already on screen by then.
 *
 * Every catalog write is a promise now: the write hook awaits its own write —
 * `settleWrite` is inside it — so what arrives here is a rejection rather than a
 * throw at call time. The synchronous pair these replaced took a builder that
 * returned a transaction, which is what the old `*FromValues` helpers did.
 */
export function commitCatalogSave({
	save,
	onWritten,
	failureMessage,
}: {
	readonly save: () => Promise<void>;
	/** Runs once the write is enqueued — closing the dialog it was made in. */
	readonly onWritten?: (() => void) | undefined;
	/** What to say if the write never persists. */
	readonly failureMessage: string;
}): void {
	let started: Promise<void>;
	try {
		// Separate from the await so a builder that throws on a bad value — an empty
		// name, an unparseable threshold — is still a toast rather than an unhandled
		// rejection, and still leaves the dialog open.
		started = save();
	} catch (saveError) {
		toast.error(errorMessageForSave(saveError));
		return;
	}

	onWritten?.();
	void started.catch((error: unknown) => {
		const message = errorMessageForSave(error);
		toast.error(message === 'Unable to save changes.' ? failureMessage : message);
	});
}

/**
 * Flip a catalog record's lifecycle in place — reversible, so no confirm step.
 *
 * `activateVerb` is what the failure message calls the way back. Most catalogs
 * retire and restore the same record, so it reads "reactivate"; a formulation's
 * first activation is not a return to anything.
 */
export function toggleCatalogActive({
	name,
	isActive,
	apply,
	activateVerb = 'reactivate',
}: {
	readonly name: string;
	readonly isActive: boolean;
	readonly apply: (nextActive: boolean) => Promise<void>;
	readonly activateVerb?: 'activate' | 'reactivate';
}): void {
	const nextActive = !isActive;
	commitCatalogSave({
		failureMessage: nextActive
			? `Unable to ${activateVerb} ${name}.`
			: `Unable to deactivate ${name}.`,
		save: () => apply(nextActive),
	});
}
