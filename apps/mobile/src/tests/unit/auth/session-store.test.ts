import { describe, expect, it, vi } from 'vitest';
import { createSessionStore, type SecureStoreLike } from '../../../auth/session-store';

/**
 * The keystore behaviours that are invisible from the app.
 *
 * A session store that quietly answers wrong does not throw — it signs someone
 * out, once, on a phone in a field, and looks fine everywhere else.
 */

function fakeStore(initial: string | null = null) {
	let value = initial;

	return {
		getItemAsync: vi.fn(async () => value),
		setItemAsync: vi.fn(async (_key: string, next: string) => {
			value = next;
		}),
		deleteItemAsync: vi.fn(async () => {
			value = null;
		}),
	} satisfies SecureStoreLike;
}

describe('createSessionStore', () => {
	it('reads the stored session', async () => {
		const store = createSessionStore(fakeStore('sealed'));

		await expect(store.read()).resolves.toBe('sealed');
	});

	it('hits the keystore once, then serves from memory', async () => {
		const backing = fakeStore('sealed');
		const store = createSessionStore(backing);

		await store.read();
		await store.read();
		await store.read();

		expect(backing.getItemAsync).toHaveBeenCalledTimes(1);
	});

	it('caches the absence of a session too', async () => {
		const backing = fakeStore(null);
		const store = createSessionStore(backing);

		await expect(store.read()).resolves.toBeNull();
		await expect(store.read()).resolves.toBeNull();
		expect(backing.getItemAsync).toHaveBeenCalledTimes(1);
	});

	it('serves a written session without going back to the keystore', async () => {
		const backing = fakeStore(null);
		const store = createSessionStore(backing);

		await store.read();
		await store.write('rotated');

		await expect(store.read()).resolves.toBe('rotated');
		expect(backing.getItemAsync).toHaveBeenCalledTimes(1);
		expect(backing.setItemAsync).toHaveBeenCalledWith('simmer.session', 'rotated');
	});

	it('forgets the session on clear', async () => {
		const backing = fakeStore('sealed');
		const store = createSessionStore(backing);

		await store.read();
		await store.clear();

		await expect(store.read()).resolves.toBeNull();
		expect(backing.deleteItemAsync).toHaveBeenCalledWith('simmer.session');
	});

	/*
	 * The one that matters. A keystore read can fail transiently — a locked
	 * device, a Keychain hiccup — and caching that failure would turn one bad
	 * moment into "signed out until the app is force-quit", with a stored session
	 * sitting right there unread.
	 */
	it('does not cache an unreadable keystore', async () => {
		let failing = true;
		const backing = {
			getItemAsync: vi.fn(async () => {
				if (failing) {
					throw new Error('keychain unavailable');
				}

				return 'sealed';
			}),
			setItemAsync: vi.fn(async () => undefined),
			deleteItemAsync: vi.fn(async () => undefined),
		} satisfies SecureStoreLike;

		const store = createSessionStore(backing);

		await expect(store.read()).resolves.toBeNull();

		failing = false;
		await expect(store.read()).resolves.toBe('sealed');
	});
});
