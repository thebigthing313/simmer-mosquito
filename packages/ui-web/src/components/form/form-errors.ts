type ErrorLike = {
	readonly message?: unknown;
};

/**
 * The object a form-level validator returns to address a field by name.
 *
 * TanStack Form treats any returned object with a `fields` key as this shape and
 * routes `form` to the form and each `fields` entry to its field. Without a
 * `fields` key it does no such routing — the whole object lands in
 * `state.errors` untouched — so this layer reads `form` out of it either way.
 */
type GlobalFormError = {
	readonly form?: unknown;
	readonly fields?: unknown;
};

export interface FieldErrorMessage {
	readonly message: string;
}

export function errorMessagesFrom(errors: readonly unknown[]): FieldErrorMessage[] {
	const messages = errors.flatMap(errorMessageFrom).filter((message) => message.length > 0);
	return [...new Set(messages)].map((message) => ({ message }));
}

function errorMessageFrom(error: unknown): string[] {
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

		const candidate = error as GlobalFormError;
		if ('form' in candidate || 'fields' in candidate) {
			const formMessages = errorMessageFrom(candidate.form);
			if (formMessages.length > 0) {
				return formMessages;
			}

			// `fields` is deliberately dropped: those messages render on the fields
			// they name, and repeating them in the alert says everything twice.
			if (carriesFieldMessages(candidate.fields)) {
				return [];
			}
		}
	}

	return ['Unable to save changes.'];
}

/**
 * Whether `fields` holds at least one message a field will render.
 *
 * A validator writes it as a record of field name to message, so anything else
 * under that key, an array or an empty object, is not a field speaking. Saying
 * nothing is only right when a field is already saying it: otherwise the alert
 * would empty out and lose the failure, which is the bug this file fixes.
 */
function carriesFieldMessages(fields: unknown): boolean {
	if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
		return false;
	}
	return Object.values(fields).some((message) => typeof message === 'string' && message.length > 0);
}
