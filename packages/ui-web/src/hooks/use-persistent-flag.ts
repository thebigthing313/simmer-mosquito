import { useCallback, useState } from 'react';

/**
 * A boolean UI preference that survives reloads.
 *
 * Reads `localStorage` lazily on first render — in a browser this happens before
 * paint, so a persisted choice never flashes as its default. Storage access is
 * guarded because private-mode and embedded webviews can throw on read or write;
 * a preference is not worth crashing the shell over, so failures fall back to the
 * in-memory value.
 */
export function usePersistentFlag(
	key: string,
	defaultValue: boolean,
): readonly [boolean, (next: boolean) => void] {
	const [value, setValue] = useState(() => readFlag(key) ?? defaultValue);

	const set = useCallback(
		(next: boolean) => {
			setValue(next);
			writeFlag(key, next);
		},
		[key],
	);

	return [value, set];
}

function readFlag(key: string): boolean | null {
	try {
		const stored = globalThis.localStorage?.getItem(key);
		return stored === null || stored === undefined ? null : stored === 'true';
	} catch {
		return null;
	}
}

function writeFlag(key: string, value: boolean): void {
	try {
		globalThis.localStorage?.setItem(key, String(value));
	} catch {
		// Preference is in-memory only for this session.
	}
}
