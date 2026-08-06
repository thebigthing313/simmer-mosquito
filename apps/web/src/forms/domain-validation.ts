import { DomainValidationError } from '@simmer-mosquito/domain';

/**
 * Form-level validation that runs the record's own domain command builder.
 *
 * The builders in `packages/domain` are the validation contract — the server
 * runs the same ones and rejects with the same issues. Re-stating their rules in
 * the form would be two sources of truth that drift; running them is one.
 *
 * A form that skips this still saves correctly, but the operator learns what is
 * wrong from a round-trip and a generic "Unable to save", with no idea which
 * field to fix. Running the builder on submit turns that into a message on the
 * field, before anything is sent.
 *
 * Context-dependent rules (does this id belong to your agency, is the row still
 * open, is the name unique) stay server-side by design — see the validation
 * boundary in `docs/domain-command-contract.md`. Those still surface as form
 * errors, they just cannot be checked here.
 */

/**
 * Stand-in ids for the command context a form does not own.
 *
 * Every builder starts by requiring an organization and an actor, but neither is
 * a field an operator fills in — they come from the session at write time. The
 * form supplies well-formed placeholders so the builder proceeds to the rules
 * that *are* the operator's to fix, and {@link CONTEXT_ISSUE_PATHS} drops any
 * complaint about the placeholders themselves.
 */
export const FORM_VALIDATION_CONTEXT = {
	organizationId: '00000000-0000-4000-8000-000000000001',
	actorProfileId: '00000000-0000-4000-8000-000000000002',
} as const;

/** Issue paths that describe the session, not the form. */
const CONTEXT_ISSUE_PATHS: ReadonlySet<string> = new Set([
	'organizationId',
	'actorProfileId',
	'operatorUserId',
]);

export interface DomainFormErrors {
	/** Errors that belong to a named field. */
	readonly fields: Record<string, string>;
	/** Errors with no field to attach to, shown in the form's alert. */
	readonly form: readonly string[];
}

/**
 * Run `build` and translate a `DomainValidationError` into per-field messages.
 *
 * `pathMap` maps a domain issue path (`habitatId`, `locationSource.geometry`) to
 * the form field that holds it. Issues with no mapping — geometry captured
 * outside the field tree, say — land on the form itself, so nothing is swallowed.
 */
export function validateAgainstCommand(
	build: () => unknown,
	pathMap: Readonly<Record<string, string>> = {},
	idIssuePaths: ReadonlySet<string> = new Set(),
): DomainFormErrors | undefined {
	try {
		build();
		return undefined;
	} catch (error) {
		if (!(error instanceof DomainValidationError)) {
			throw error;
		}
		const fields: Record<string, string> = {};
		const form: string[] = [];
		for (const issue of error.issues) {
			if (CONTEXT_ISSUE_PATHS.has(issue.path) || idIssuePaths.has(issue.path)) {
				continue;
			}
			const field = pathMap[issue.path];
			if (field === undefined) {
				form.push(issue.message);
			} else if (fields[field] === undefined) {
				// First issue per field wins; later ones are usually consequences.
				fields[field] = issue.message;
			}
		}
		return { fields, form };
	}
}

/**
 * The shape TanStack Form's form-level `onSubmit` validator expects.
 *
 * Returning `undefined` passes. Otherwise `fields` populates each named field's
 * error and `form` populates the alert.
 */
function toFormValidatorResult(
	errors: DomainFormErrors | undefined,
): { readonly form?: string; readonly fields?: Record<string, string> } | undefined {
	if (errors === undefined) {
		return undefined;
	}
	const hasFields = Object.keys(errors.fields).length > 0;
	if (!hasFields && errors.form.length === 0) {
		return undefined;
	}
	return {
		...(errors.form.length > 0 ? { form: errors.form.join(' ') } : {}),
		...(hasFields ? { fields: errors.fields } : {}),
	};
}

/**
 * The whole thing in one call: a `validators.onSubmit` for `useAppForm`.
 *
 * ```ts
 * validators: {
 *   onSubmit: domainValidator(
 *     ({ value }) => createHabitatCommand({ ...ctx, ...value, locationSource }),
 *     { description: 'description', habitatTypeId: 'habitatTypeId' },
 *   ),
 * }
 * ```
 */
export function domainValidator<TValue>(
	build: (input: { readonly value: TValue }) => unknown,
	pathMap: Readonly<Record<string, string>> = {},
	/** Extra paths to ignore — a record id the form generates at save time, say. */
	ignorePaths: ReadonlySet<string> = new Set(),
) {
	return ({ value }: { readonly value: TValue }) =>
		toFormValidatorResult(validateAgainstCommand(() => build({ value }), pathMap, ignorePaths));
}
