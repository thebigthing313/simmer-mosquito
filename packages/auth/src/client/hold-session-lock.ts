import { SESSION_LOCK_NAME, type SessionLockManager } from './session-lock-manager.js';

/**
 * Run `operation` under the cross-tab session lock, waiting at most
 * `lockWaitMs` for it. A lock that does not arrive, or cannot be asked for,
 * loses the cross-tab guarantee rather than the session read; an operation
 * that ran and threw rethrows.
 */
export async function holdSessionLock<T>(
	locks: SessionLockManager | null,
	lockWaitMs: number,
	operation: () => Promise<T>,
): Promise<T> {
	if (locks === null) {
		return operation();
	}

	const waited = new AbortController();
	const timer = setTimeout(() => waited.abort(), lockWaitMs);
	let started = false;

	try {
		return await locks.request(SESSION_LOCK_NAME, { signal: waited.signal }, () => {
			started = true;
			return operation();
		});
	} catch (error) {
		if (started) {
			throw error;
		}

		return operation();
	} finally {
		clearTimeout(timer);
	}
}
