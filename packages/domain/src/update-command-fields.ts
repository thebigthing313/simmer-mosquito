import {
	actorDefaultProfileId,
	createIssues,
	humanizeCommandType,
	jsonObject,
	normalizeOptionalTimestamp,
	normalizeStringUnion,
	nullableText,
	type OrganizationCommandContextInput,
	type OrganizationCommandContextPayload,
	optionalUuid,
	requiredText,
	requiredUuid,
	throwIfIssues,
	validateLocalDate,
	validateNotFutureLocalDate,
	validateOrganizationCommandContext,
} from './command-validation.js';
import type { DomainId, DomainValidationIssue, JsonObject, LocalDateString } from './shared.js';

/**
 * How one updatable field turns what a caller typed into what the command
 * carries.
 *
 * The first parameter's type is the field's input type and the return type is
 * what `changes` holds for it, so one arrow states both halves. Whatever a
 * normalizer needs beyond the value, a length cap or an allowed list, is closed
 * over where the field is declared rather than threaded through here.
 */
export type UpdateFieldNormalizer<TInput, TOutput> = (
	value: TInput,
	path: string,
	issues: DomainValidationIssue[],
	actor: UpdateCommandActor,
) => TOutput;

/**
 * The one neighbour a field normalizer may read.
 *
 * A normalizer that reached for the rest of the input would be the coupling
 * this whole mechanism exists to remove, and exactly one rule needs a
 * neighbour: a Profile field left null falls back to whoever is running the
 * command. So that field, and nothing else, is what the fourth argument
 * carries. Most normalizers declare three parameters and never see it.
 */
export interface UpdateCommandActor {
	readonly actorProfileId: DomainId;
}

/**
 * The fields one update command may change, each named once.
 *
 * This is the single statement of a command's field list. The input type, the
 * `changes` type, the check that the payload names a change, and the `changes`
 * the builder returns are all read off it, so a field is added by adding an
 * entry and cannot be added to three of the four and left out of the fourth.
 *
 * Declare a set with `satisfies UpdateFieldSet` rather than as an annotation,
 * so the keys and the normalizer types survive into {@link UpdateFieldsInput}
 * and {@link UpdateFieldsChanges}.
 */
export type UpdateFieldSet = Readonly<Record<string, UpdateFieldNormalizer<never, unknown>>>;

/** What a caller may pass: every declared field, optional, at its input type. */
export type UpdateFieldsInput<TFields extends UpdateFieldSet> = {
	readonly [Field in keyof TFields]?: Parameters<TFields[Field]>[0];
};

/** What the command carries: every declared field, optional, normalized. */
export type UpdateFieldsChanges<TFields extends UpdateFieldSet> = {
	readonly [Field in keyof TFields]?: ReturnType<TFields[Field]>;
};

/**
 * The declared fields the input names, normalized, in declaration order.
 *
 * A field the input leaves `undefined` is absent from the result rather than
 * present and null, which is the distinction the server reads to tell "clear
 * this" from "leave this alone". Naming none of them is the one thing an update
 * cannot mean, so that is the issue this reports.
 *
 * Pass `null` for the message where a second register also counts as a change,
 * and the caller then owns that check. One command does: a weather summary's
 * 25 metrics are their own register, so a date range naming nothing is not yet
 * an empty edit.
 */
export function normalizeUpdateFields<TFields extends UpdateFieldSet>(
	input: UpdateFieldsInput<TFields>,
	fields: TFields,
	emptyChangeMessage: string | null,
	issues: DomainValidationIssue[],
): UpdateFieldsChanges<TFields> {
	const values = input as Readonly<Record<string, unknown>>;
	const named = Object.keys(fields).filter((field) => values[field] !== undefined);
	if (named.length === 0 && emptyChangeMessage !== null) {
		issues.push({ path: 'changes', message: emptyChangeMessage });
	}

	const actor = values as unknown as UpdateCommandActor;
	const changes: Record<string, unknown> = {};
	for (const field of named) {
		const normalize = fields[field] as UpdateFieldNormalizer<unknown, unknown>;
		changes[field] = normalize(values[field], field, issues, actor);
	}
	return changes as UpdateFieldsChanges<TFields>;
}

/**
 * An update command: the organization context, the record's id, and the fields
 * the caller named.
 *
 * A command that also carries an acknowledgement flag or a second id spreads
 * this payload and adds it, which is what keeps a flag beside the command that
 * needs it rather than inside a factory several commands share.
 */
export function updateFieldsCommand<
	TType extends string,
	TIdKey extends string,
	TFields extends UpdateFieldSet,
>(
	options: Readonly<{
		type: TType;
		input: UpdateFieldsInput<TFields> &
			OrganizationCommandContextInput &
			Record<TIdKey, string | null | undefined>;
		idKey: TIdKey;
		fields: TFields;
		/** The noun the "at least one field must change" issue names. */
		changeNoun: string;
		/** That issue's whole sentence, where the noun alone does not read. */
		emptyChangeMessage?: string;
		message?: string;
	}>,
): Readonly<{
	readonly type: TType;
	readonly payload: OrganizationCommandContextPayload &
		Record<TIdKey, string> & { readonly changes: UpdateFieldsChanges<TFields> };
}> {
	const { type, input, idKey, fields } = options;
	const issues = createIssues();
	const context = validateOrganizationCommandContext(input, issues);
	const id = requiredUuid(input[idKey], idKey, issues);
	const changes = normalizeUpdateFields(
		input,
		fields,
		options.emptyChangeMessage ?? `At least one ${options.changeNoun} field must change.`,
		issues,
	);
	throwIfIssues(options.message ?? `${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: { ...context, [idKey]: id, changes } as OrganizationCommandContextPayload &
			Record<TIdKey, string> & { readonly changes: UpdateFieldsChanges<TFields> },
	};
}

/** Free text the field requires, trimmed, and capped when a cap is given. */
export function requiredTextField(
	maxLength?: number,
): UpdateFieldNormalizer<string | undefined, string> {
	return (value, path, issues) => requiredText(value, path, issues, maxLength);
}

/** Free text the field may clear, trimmed, with empty as `null`. */
export function nullableTextField(
	maxLength?: number,
): UpdateFieldNormalizer<string | null | undefined, string | null> {
	return (value, path, issues) => nullableText(value, path, issues, maxLength);
}

/** A value the field accepts only from a fixed list. */
export function stringUnionField<TValue extends string>(
	allowedValues: readonly TValue[],
): UpdateFieldNormalizer<TValue | undefined, TValue> {
	return (value, path, issues) => normalizeStringUnion(value, allowedValues, path, issues);
}

/** An instant the field may clear, refused as future unless `allowFuture` says otherwise. */
export function timestampField(
	allowFuture: boolean,
): UpdateFieldNormalizer<Date | null | undefined, Date | null> {
	return (value, path, issues) => normalizeOptionalTimestamp(value, path, issues, allowFuture);
}

/** Another record this one names, required once the field is named at all. */
export const referenceIdField: UpdateFieldNormalizer<DomainId | undefined, DomainId> = (
	value,
	path,
	issues,
) => requiredUuid(value, path, issues);

/** Another record this one names, which the field may also clear. */
export const nullableReferenceIdField: UpdateFieldNormalizer<
	DomainId | null | undefined,
	DomainId | null
> = (value, path, issues) => optionalUuid(value, path, issues);

/**
 * A Profile the field names, falling back to whoever is running the command.
 *
 * The one normalizer that reads {@link UpdateCommandActor}. A caller clearing
 * the field is saying "whoever I am", not "nobody", which is why the value it
 * writes is never null.
 */
export const actorDefaultProfileIdField: UpdateFieldNormalizer<
	DomainId | null | undefined,
	DomainId
> = (value, path, issues, actor) => {
	optionalUuid(value, path, issues);
	return actorDefaultProfileId(value, actor.actorProfileId);
};

/**
 * A value the field carries as the caller typed it.
 *
 * For a column whose whole rule is its type: an enum the compiler already holds
 * to its union, or a value a neighbouring rule validates. Nothing to normalize
 * is still a field, and a field the descriptor omits is one an edit drops.
 */
export function passThroughField<TValue>(): UpdateFieldNormalizer<TValue, TValue> {
	return (value) => value;
}

/** A calendar date for work already done, refused for being ahead of today. */
export const notFutureLocalDateField: UpdateFieldNormalizer<
	LocalDateString | undefined,
	LocalDateString
> = (value, path, issues) => {
	validateNotFutureLocalDate(value, path, issues);
	return value as LocalDateString;
};

/** A calendar date the field carries as typed, in any direction. */
export const localDateField: UpdateFieldNormalizer<LocalDateString | undefined, LocalDateString> = (
	value,
	path,
	issues,
) => {
	validateLocalDate(value, path, issues);
	return value as LocalDateString;
};

/** A JSON document the field may clear. */
export const jsonObjectField: UpdateFieldNormalizer<unknown, JsonObject | null> = (
	value,
	path,
	issues,
) => jsonObject(value, path, issues);
