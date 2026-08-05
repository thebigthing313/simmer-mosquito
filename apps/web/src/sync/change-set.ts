/**
 * Recognising a PATCH that has nothing to say.
 *
 * Update handlers build their body by diffing the original row against the
 * modified one, so a body can legitimately come out empty: a save whose real
 * change lives in another table (a record's crew, its batches), or one where the
 * user opened the edit form and changed nothing at all. Every update command
 * rejects an empty change set — "At least one field must change" — so sending it
 * turns a no-op into a failed save, and on a form that bundles child writes it
 * fails the whole save over a parent that needed no update.
 *
 * Handlers skip the request instead and contribute no txid, which leaves the
 * mutation with nothing to wait on and settles it immediately.
 */
export function isNoOpUpdate(body: Readonly<Record<string, unknown>>): boolean {
	return Object.keys(body).length === 0;
}

/**
 * The PATCH body for an update: the keys this handler can express, that changed.
 *
 * Lived in seven copies before this, which is how #35 hid. The trap route page
 * reordered stops by writing `position`, `createRouteItemMutationHandlers`
 * declares `patchKeys: ['directionsToNextItem']`, so the diff produced no key,
 * `isNoOpUpdate` skipped the request, and the mutation settled successfully with
 * nothing sent. The UI showed the new order until sync overwrote it, and nothing
 * reported a failure.
 *
 * The skip is still right — see `isNoOpUpdate` — so the fix is to tell the two
 * cases apart. "Nothing changed" is normal. "Something changed that this handler
 * cannot express" is a bug in either the caller or the handler, and `handler`
 * names the one to go and look at.
 *
 * Values are compared by content rather than by reference: two of the seven
 * copies already did, and the ones that did not would put an untouched
 * `metadata` object in the body whenever a form rebuilt it.
 */
export function pickChanged<TRow extends object, TKey extends keyof TRow>(
	original: Partial<TRow>,
	modified: TRow,
	patchKeys: readonly TKey[],
	handler: string,
): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	for (const key of patchKeys) {
		if (!valuesEqual(original[key], modified[key])) {
			body[key as string] = modified[key];
		}
	}

	if (import.meta.env.DEV) {
		warnDroppedChanges(original, modified, patchKeys, handler);
	}

	return body;
}

/** Whether two row values are the same, treating objects as their JSON. */
export function valuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (typeof a === 'object' || typeof b === 'object') {
		return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
	}
	return false;
}

/**
 * Development-only: complain about a change the handler silently dropped.
 *
 * Production behaviour is unchanged. This is a warning rather than a throw
 * because the failure it catches is a mismatch between a page and a handler,
 * and the person who can fix it is the one running the dev server.
 */
function warnDroppedChanges<TRow extends object, TKey extends keyof TRow>(
	original: Partial<TRow>,
	modified: TRow,
	patchKeys: readonly TKey[],
	handler: string,
): void {
	const expressible = new Set<string>(patchKeys.map(String));
	const dropped = [...new Set([...Object.keys(original), ...Object.keys(modified)])].filter(
		(key) =>
			!expressible.has(key) &&
			!valuesEqual(
				(original as Record<string, unknown>)[key],
				(modified as Record<string, unknown>)[key],
			),
	);
	if (dropped.length === 0) {
		return;
	}

	console.warn(
		`[sync] ${handler}: changed ${dropped.map((key) => `\`${key}\``).join(', ')}, which its patchKeys cannot send. ` +
			'Either the caller is writing the wrong field or the handler is missing a key; ' +
			'as it stands the change is dropped and the mutation settles as a success.',
		{ handler, dropped, patchKeys: [...expressible] },
	);
}
