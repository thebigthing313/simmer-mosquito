export function errorName(error: unknown): string | undefined {
	if (error instanceof Error) {
		return error.name;
	}

	return undefined;
}
