/**
 * What to show the user when a write does not land.
 *
 * A builder that throws on a bad value and a command the server rejects arrive
 * as the same thing at the surface that made the write, so both read their
 * message from here. A caller with a more specific sentence for the case where
 * the failure carries none passes it as `fallback`; the older callers compare
 * against the generic string and use theirs instead.
 */
export function errorMessageForSave(
	saveError: unknown,
	fallback = 'Unable to save changes.',
): string {
	return saveError instanceof Error ? saveError.message : fallback;
}
