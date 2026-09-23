import type { SessionLockManager } from './session-lock-manager.js';

/**
 * The platform's lock manager, or `null` where there is none: React Native
 * has no Web Locks and no tabs to race.
 */
export function platformLocks(): SessionLockManager | null {
	const locks = (globalThis as { readonly navigator?: { readonly locks?: unknown } }).navigator
		?.locks;

	return typeof (locks as SessionLockManager | undefined)?.request === 'function'
		? (locks as SessionLockManager)
		: null;
}
