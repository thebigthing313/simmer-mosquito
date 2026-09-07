/**
 * A rejected write, expressed as the form-level error `FormErrorAlert` renders.
 *
 * The form kit has one place a failure is shown, `form.FormErrorAlert`, and it
 * reads `form.state.errors`. A `useAppForm` submit handler that throws does not
 * land there: `handleSubmit` rethrows and leaves the store alone, so a caught
 * rejection has to be written into the error map by hand.
 *
 * The `{ form, fields }` shape is the only one `setErrorMap` accepts for a key
 * whose validator was never declared, and it is the shape `errorMessagesFrom`
 * reads the message back out of. `fields` is empty because nothing here knows
 * which field the server objected to.
 *
 * One consequence worth knowing: the error makes the form invalid, so Save is
 * disabled until the operator changes something. TanStack clears an `onSubmit`
 * error on the next change validation, so the first keystroke in any field puts
 * the button back. That is right for a refusal naming a value and blunt for a
 * dropped connection, which is the trade this shape makes.
 */
export function saveFailure(caught: unknown): {
	readonly onSubmit: {
		readonly form: string;
		readonly fields: Record<string, never>;
	};
} {
	return { onSubmit: { form: saveFailureMessage(caught), fields: {} } };
}

/** The server's own words when it gave any, and a fallback when it did not. */
function saveFailureMessage(caught: unknown): string {
	if (caught instanceof Error && caught.message.trim() !== '') {
		return caught.message;
	}
	return 'Unable to save.';
}
