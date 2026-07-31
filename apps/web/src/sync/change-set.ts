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
