type ErrorLike = {
	readonly message?: unknown;
};

export interface FieldErrorMessage {
	readonly message: string;
}

export function errorMessagesFrom(errors: readonly unknown[]): FieldErrorMessage[] {
	const messages = errors.flatMap(errorMessageFrom).filter((message) => message.length > 0);
	return [...new Set(messages)].map((message) => ({ message }));
}

export function errorMessageFrom(error: unknown): string[] {
	if (error === null || error === undefined || error === false) {
		return [];
	}

	if (Array.isArray(error)) {
		return error.flatMap(errorMessageFrom);
	}

	if (typeof error === 'string') {
		return [error];
	}

	if (typeof error === 'number' || typeof error === 'bigint') {
		return [String(error)];
	}

	if (typeof error === 'object') {
		const message = (error as ErrorLike).message;
		if (typeof message === 'string') {
			return [message];
		}
	}

	return ['Unable to save changes.'];
}
