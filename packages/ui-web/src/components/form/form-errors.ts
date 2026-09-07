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

/** What the alert says when nothing in the error names a reason. */
const GENERIC_MESSAGE = 'Unable to save changes.';

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
		return objectErrorMessageFrom(error);
	}

	return [GENERIC_MESSAGE];
}

/** The two object shapes a form hands us: an `Error`, and a validator's result. */
function objectErrorMessageFrom(error: object): string[] {
	const message = (error as ErrorLike).message;
	if (typeof message === 'string') {
		return [message];
	}

	const candidate = error as GlobalFormError;
	if (!('form' in candidate) && !('fields' in candidate)) {
		return [GENERIC_MESSAGE];
	}

	const formMessages = errorMessageFrom(candidate.form);
	if (formMessages.length > 0) {
		return formMessages;
	}

	// `fields` is deliberately dropped: those messages render on the fields they
	// name, and repeating them in the alert says everything twice.
	return carriesFieldMessages(candidate.fields) ? [] : [GENERIC_MESSAGE];
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

/**
 * A save that threw, recorded so the kit's one alert can render it.
 *
 * The kit catches a rejected `onSubmit` and writes this into the form's error
 * map, which is what lets one alert say both a validation failure and a save
 * failure. Every form used to hold a second piece of state, catch its own
 * throw, coerce it to a string and paint a second alert under the same title,
 * so the title rendered twice and two channels held two states with no rule
 * saying which won.
 *
 * The message comes back through `errorMessagesFrom`, so the coercion each form
 * was spelling out is written once and the fallback sentence is the same
 * everywhere.
 */
export class SaveFailure extends Error {
	constructor(cause: unknown) {
		super(errorMessagesFrom([cause])[0]?.message ?? GENERIC_MESSAGE, { cause });
		this.name = 'SaveFailure';
	}
}

export function isSaveFailure(error: unknown): error is SaveFailure {
	return error instanceof SaveFailure;
}

/**
 * Whether a recorded save failure is the only thing holding the form invalid.
 *
 * The error map is what `canSubmit` reads, so recording a save failure there
 * disables the save button until the user edits a field. That is right for a
 * validation error and wrong for a save the server refused or the network
 * dropped, where trying again is the whole of what the user wants to do. So the
 * button asks this as well, and the kit drops the recorded failure when the next
 * attempt arrives.
 */
export function saveFailureAloneBlocksSubmit(state: {
	readonly errors: readonly unknown[];
	readonly isFieldsValid: boolean;
	readonly isFieldsValidating: boolean;
}): boolean {
	return (
		state.isFieldsValid &&
		!state.isFieldsValidating &&
		state.errors.length > 0 &&
		state.errors.every(isSaveFailure)
	);
}
