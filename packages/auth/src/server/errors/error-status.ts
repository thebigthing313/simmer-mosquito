export function errorStatus(error: unknown): number | undefined {
	if (typeof error === 'object' && error !== null) {
		const status = (error as { readonly status?: unknown }).status;
		if (typeof status === 'number') {
			return status;
		}
	}

	return undefined;
}
