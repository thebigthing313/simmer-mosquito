/** The body's `reason` when it is a non-empty string, otherwise `fallback`. */
export function readReason(data: { readonly reason?: unknown }, fallback: string): string {
	return typeof data.reason === 'string' && data.reason.trim() !== '' ? data.reason : fallback;
}
