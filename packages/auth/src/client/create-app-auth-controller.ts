import type { AppAuthController } from './app-auth-controller.js';
import type { AuthMe } from './auth-me.js';
import { holdSessionLock } from './hold-session-lock.js';
import { platformLocks } from './platform-locks.js';
import type { SessionLockManager } from './session-lock-manager.js';

/**
 * How long a tab waits for the lock before going ahead without it, so one tab
 * whose `/auth/me` hangs does not leave every other tab on a spinner.
 */
const DEFAULT_LOCK_WAIT_MS = 5_000;

/**
 * Build the controller over one app's `/auth/me`. Each app calls this once at
 * module scope. Every renewal and exchange is serialized per tab through a
 * promise chain and across tabs through the Web Lock, because the sealed
 * session's refresh token is single use (#298, #304).
 */
export function createAppAuthController(options: {
	readonly getAuthMe: () => Promise<AuthMe>;
	/** Omitted, the platform's own; `null` turns the cross-tab lock off. */
	readonly locks?: SessionLockManager | null;
	/** Override {@link DEFAULT_LOCK_WAIT_MS}. For tests. */
	readonly lockWaitMs?: number;
}): AppAuthController {
	const { getAuthMe } = options;
	const locks = options.locks === undefined ? platformLocks() : options.locks;
	const lockWaitMs = options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;

	let snapshot: AuthMe | null = null;
	let pending: Promise<AuthMe> | null = null;
	const listeners = new Set<() => void>();

	/** The tail of everything that rotates the session; a chain so it survives a failure. */
	let gate: Promise<unknown> = Promise.resolve();

	function serialize<T>(operation: () => Promise<T>): Promise<T> {
		const queued = () => holdSessionLock(locks, lockWaitMs, operation);
		const run = gate.then(queued, queued);
		gate = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	function load(): Promise<AuthMe> {
		if (snapshot !== null) {
			return Promise.resolve(snapshot);
		}

		return renew();
	}

	/** One request however many callers ask in the same tick; dropped once settled. */
	function renew(): Promise<AuthMe> {
		pending ??= serialize(ask).finally(() => {
			pending = null;
		});

		return pending;
	}

	function exchange<T>(operation: () => Promise<T>): Promise<T> {
		return serialize(operation);
	}

	function refresh(): Promise<AuthMe> {
		return holdSessionLock(locks, lockWaitMs, ask);
	}

	/**
	 * A round trip that broke is not a refusal, so the snapshot is left alone:
	 * caching one would sign the reader out for the life of the page.
	 */
	async function ask(): Promise<AuthMe> {
		try {
			const answer = await getAuthMe();
			snapshot = answer;
			return answer;
		} catch (error) {
			return (
				snapshot ?? {
					authenticated: false,
					error: 'unavailable',
					reason: error instanceof Error ? error.message : 'Unable to load auth state.',
				}
			);
		} finally {
			emit();
		}
	}

	function emit(): void {
		for (const listener of listeners) {
			listener();
		}
	}

	return {
		get snapshot() {
			return snapshot;
		},
		load,
		refresh,
		renew,
		exchange,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
