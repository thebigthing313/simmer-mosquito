/**
 * What to show the user when a write does not land.
 *
 * A builder that throws on a bad value and a command the server rejects arrive
 * as the same thing at the surface that made the write, so both read their
 * message from here. Callers that have a more specific fallback compare against
 * the generic string and use theirs instead.
 */
export function errorMessageForSave(saveError: unknown): string {
	return saveError instanceof Error ? saveError.message : 'Unable to save changes.';
}
