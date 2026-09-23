/** A `returnTo` on one of the app origins, or `null`, which the caller replaces with the app origin. */
export function readAllowedReturnTo(
	value: string | undefined,
	appOrigins: readonly string[],
): string | null {
	if (value === undefined || value.trim() === '') {
		return null;
	}

	try {
		const url = new URL(value);
		return appOrigins.includes(url.origin) ? url.toString() : null;
	} catch {
		return null;
	}
}
