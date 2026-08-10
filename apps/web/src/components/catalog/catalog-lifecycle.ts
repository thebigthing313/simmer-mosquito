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
export function commitCatalogWrite({
	write,
	onWritten,
	failureMessage,
}: {
	readonly write: () => PersistenceTransaction;
	/** Runs once the write is enqueued — closing the dialog it was made in. */
	readonly onWritten?: (() => void) | undefined;
	/** What to say if the write never persists. */
	readonly failureMessage: string;
}): void {
	try {
		const transaction = write();
		onWritten?.();
		watchPersistence(transaction, failureMessage);
	} catch (saveError) {
		toast.error(errorMessageForSave(saveError));
	}
}

/**
 * Flip a catalog record's lifecycle in place — reversible, so no confirm step.
 *
 * `activateVerb` is what the failure message calls the way back. Most catalogs
 * retire and restore the same record, so it reads "reactivate"; a formulation's
 * first activation is not a return to anything.
 */
export function toggleCatalogLifecycle({
	name,
	isActive,
	apply,
	activateVerb = 'reactivate',
}: {
	readonly name: string;
	readonly isActive: boolean;
	readonly apply: (nextActive: boolean) => PersistenceTransaction;
	readonly activateVerb?: 'activate' | 'reactivate';
}): void {
	const nextActive = !isActive;
	commitCatalogWrite({
		failureMessage: nextActive
			? `Unable to ${activateVerb} ${name}.`
			: `Unable to deactivate ${name}.`,
		write: () => apply(nextActive),
	});
}
