/**
 * What to show the user when a write does not land.
 *
 * A builder that throws on a bad value and a command the server rejects arrive
 * as the same thing at the surface that made the write, so both read their
 * message from here. A caller with a more specific sentence for the case where
 * the failure carries none passes it as `fallback`; the older callers compare
 * against the generic string and use theirs instead.
 *
 * One rule for every surface, not only the toast. An inline `setError` on an
 * edit page or a dialog, a toast, and a per-row line in an import report all
 * answer the same question, what the thrown value says or the caller's
 * sentence when it says nothing, and #1162 found the ternary spelled by hand
 * in 35 places. A failure on the way to a write reads it too: a geocode that
 * returns nothing and a file the import cannot parse are refused at the same
 * surface as the save they were for.
 */
export function errorMessageForSave(
	saveError: unknown,
	fallback = 'Unable to save changes.',
): string {
	return saveError instanceof Error ? saveError.message : fallback;
}
