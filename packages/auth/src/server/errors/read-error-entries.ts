export function readErrorEntries(error: unknown): readonly Record<string, unknown>[] {
	const entries = (error as { readonly errors?: unknown } | null)?.errors;
	if (!Array.isArray(entries)) {
		return [];
	}
	return entries.filter(
		(entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
	);
}
