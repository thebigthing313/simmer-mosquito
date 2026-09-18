/** Presence only: a password is never trimmed or normalized. */
export function readPassword(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}
