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

		if (isGlobalFormError(error)) {
			// `fields` is deliberately dropped: those messages render on the fields
			// they name, and repeating them in the alert says everything twice.
			return errorMessageFrom((error as GlobalFormError).form);
		}
	}

	return ['Unable to save changes.'];
}

/**
 * Whether this is a form-level validator's `{ form, fields }` result.
 *
 * Either key alone qualifies. A validator that found nothing but form-level
 * problems returns `{ form }` with no `fields`, and that is the case TanStack
 * Form leaves unrouted — reading only the two-key shape would put the generic
 * fallback back on exactly the errors this exists to surface.
 */
function isGlobalFormError(error: object): boolean {
	const candidate = error as GlobalFormError;
	const hasForm = 'form' in candidate && candidate.form !== undefined;
	const hasFields =
		'fields' in candidate && typeof candidate.fields === 'object' && candidate.fields !== null;
	return hasForm || hasFields;
}
