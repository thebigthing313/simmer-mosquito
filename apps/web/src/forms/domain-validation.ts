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

/**
 * The same stand-in, for a location the operator is not being asked to draw.
 *
 * A control action recorded off a mission stop takes its geometry from the stop
 * unless the crew draws an override, so the form does not require one — but the
 * ordinary command builder these validators run does, and a null geometry fails
 * it with "must be a GeoJSON geometry object" before any other rule is reached.
 * That is a complaint about a field the operator was never shown.
 *
 * Only ever passed when the form itself is not requiring a location; when it is,
 * the real absence is caught by the form's own guard and reported against the
 * map.
 */
const FORM_VALIDATION_GEOMETRY = {
	type: 'Point',
	coordinates: [0, 0],
} as const;

/**
 * The `locationSource` a form's validator passes to the ordinary command
 * builder, standing in for a location the operator was not asked to draw.
 *
 * The builders all take a location source even where the form does not require
 * one, so every location-bearing form needs this same substitution; holding it
 * here keeps the four control-action forms from each spelling out when a null
 * geometry is a real omission and when it is the mission's to fill in.
 */
export function validationLocationSource(
	geometry: unknown,
	requireLocation: boolean,
): { readonly kind: 'geometry'; readonly geometry: never } {
	return {
		kind: 'geometry',
		geometry: (geometry ?? (requireLocation ? null : FORM_VALIDATION_GEOMETRY)) as never,
	};
}

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
			const message = humanizeIssue(issue);
			const field = pathMap[issue.path];
			if (field === undefined) {
				form.push(message);
			} else if (fields[field] === undefined) {
				// First issue per field wins; later ones are usually consequences.
				fields[field] = message;
			}
		}
		return { fields, form };
	}
}

/**
 * The same complaint, addressed to the person filling the form.
 *
 * Domain messages lead with the payload path they belong to, because their other
 * reader is an API client reading a rejection: `insecticideId is required.`,
 * `amountApplied must be a positive finite number.` Shown verbatim on a field,
 * that hands an operator an identifier they have never seen and cannot map to
 * the box in front of them. Only the leading token is rewritten — the rule the
 * rest of the sentence states is the domain's to word, not this layer's.
 */
function humanizeIssue(issue: { readonly path: string; readonly message: string }): string {
	const segment = issue.path.split('.').at(-1) ?? issue.path;
	for (const lead of [issue.path, segment]) {
		if (lead !== '' && issue.message.startsWith(`${lead} `)) {
			return `${fieldLabel(segment)}${issue.message.slice(lead.length)}`;
		}
	}
	return issue.message;
}

/** `applicationUnitId` -> `Application unit`. A trailing `Id` is plumbing, not a word. */
function fieldLabel(segment: string): string {
	const words = segment
		.replace(/Id$/, '')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
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
