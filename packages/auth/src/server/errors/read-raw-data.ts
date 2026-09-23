export function readRawData(error: unknown): Record<string, unknown> | undefined {
	if (typeof error === 'object' && error !== null && 'rawData' in error) {
		const raw = (error as { readonly rawData: unknown }).rawData;
		if (typeof raw === 'object' && raw !== null) {
			return raw as Record<string, unknown>;
		}
	}

	return undefined;
}
