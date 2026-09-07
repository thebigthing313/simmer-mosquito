/**
 * Creating a catalog row that is a name plus a few optional columns.
 *
 * The update half of this module is gone (#633). It declared five field names
 * in eight places, so a sixth field cost eight edits to a module every
 * named-reference command depended on, and 32 builders wrote the shape out by
 * hand rather than pay that. Updates are now one field descriptor per command,
 * in `update-command-fields.ts`. Creates stay here: a create names every field,
 * so a field left out of one of its lists fails `tsc` at a required payload
 * member rather than dropping an edit.
 */
import {
	createIssues,
	humanizeCommandType,
	jsonObject,
	nullableNonnegativeInteger,
	nullableText,
	type OrganizationCommandContextInput,
	type OrganizationCommandContextPayload,
	requiredText,
	requiredUuid,
	throwIfIssues,
	validateOrganizationCommandContext,
} from './command-validation.js';
import type { JsonObject } from './shared.js';

type JsonFieldName = 'customSchema' | 'metadata';
export type EmptyRecord = Record<PropertyKey, never>;

export interface NamedReferenceFieldSet {
	readonly description?: true;
	readonly customSchema?: true;
	readonly metadata?: true;
	readonly actionThreshold?: true;
	readonly serialNumber?: true;
}

export type NamedReferenceCreateInput<TFields extends NamedReferenceFieldSet> =
	OrganizationCommandContextInput & {
		readonly name: string;
		readonly description?: TFields['description'] extends true ? string | null : never;
		readonly customSchema?: TFields['customSchema'] extends true ? unknown | null : never;
		readonly metadata?: TFields['metadata'] extends true ? unknown | null : never;
		readonly actionThreshold?: TFields['actionThreshold'] extends true ? number | null : never;
		readonly serialNumber?: TFields['serialNumber'] extends true ? string | null : never;
	};

export type NamedReferenceCreatePayload<TFields extends NamedReferenceFieldSet> = {
	readonly name: string;
} & (TFields['description'] extends true ? { readonly description: string | null } : EmptyRecord) &
	(TFields['customSchema'] extends true
		? { readonly customSchema: JsonObject | null }
		: EmptyRecord) &
	(TFields['metadata'] extends true ? { readonly metadata: JsonObject | null } : EmptyRecord) &
	(TFields['actionThreshold'] extends true
		? { readonly actionThreshold: number | null }
		: EmptyRecord) &
	(TFields['serialNumber'] extends true ? { readonly serialNumber: string | null } : EmptyRecord);

export function createNamedReferenceCommand<
	TType extends string,
	TIdKey extends string,
	TFields extends NamedReferenceFieldSet,
>(
	options: Readonly<{
		type: TType;
		input: NamedReferenceCreateInput<TFields> & Record<TIdKey, string | null | undefined>;
		idKey: TIdKey;
		fields: TFields;
		message?: string;
	}>,
): Readonly<{
	readonly type: TType;
	readonly payload: OrganizationCommandContextPayload &
		Record<TIdKey, string> &
		NamedReferenceCreatePayload<TFields>;
}> {
	const { type, input, idKey, fields } = options;
	const issues = createIssues();
	const context = validateOrganizationCommandContext(input, issues);
	const id = requiredUuid(input[idKey], idKey, issues);
	const payload = normalizeCreatePayload(input, fields, issues);
	throwIfIssues(options.message ?? `${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: { ...context, [idKey]: id, ...payload } as OrganizationCommandContextPayload &
			Record<TIdKey, string> &
			NamedReferenceCreatePayload<TFields>,
	};
}

export function namedReferenceIdCommand<TType extends string, TIdKey extends string>(
	options: Readonly<{
		type: TType;
		input: OrganizationCommandContextInput & Record<TIdKey, string | null | undefined>;
		idKey: TIdKey;
		message?: string;
	}>,
): Readonly<{
	readonly type: TType;
	readonly payload: OrganizationCommandContextPayload & Record<TIdKey, string>;
}> {
	const { type, input, idKey } = options;
	const issues = createIssues();
	const context = validateOrganizationCommandContext(input, issues);
	const id = requiredUuid(input[idKey], idKey, issues);
	throwIfIssues(options.message ?? `${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: { ...context, [idKey]: id } as OrganizationCommandContextPayload &
			Record<TIdKey, string>,
	};
}

function normalizeCreatePayload<TFields extends NamedReferenceFieldSet>(
	input: NamedReferenceCreateInput<TFields>,
	fields: TFields,
	issues: ReturnType<typeof createIssues>,
): NamedReferenceCreatePayload<TFields> {
	const payload: Record<string, unknown> = {
		name: requiredText(input.name, 'name', issues, 200),
	};
	addConfiguredFields(payload, input, fields, issues);
	return payload as NamedReferenceCreatePayload<TFields>;
}

function addConfiguredFields<TFields extends NamedReferenceFieldSet>(
	payload: Record<string, unknown>,
	input: NamedReferenceCreateInput<TFields>,
	fields: TFields,
	issues: ReturnType<typeof createIssues>,
): void {
	if (fields.description === true) {
		payload.description = nullableText(input.description, 'description', issues, 2_000);
	}
	if (fields.customSchema === true) {
		payload.customSchema = normalizeJsonField(input.customSchema, 'customSchema', issues);
	}
	if (fields.metadata === true) {
		payload.metadata = normalizeJsonField(input.metadata, 'metadata', issues);
	}
	if (fields.actionThreshold === true) {
		payload.actionThreshold = nullableNonnegativeInteger(
			input.actionThreshold,
			'actionThreshold',
			issues,
		);
	}
	if (fields.serialNumber === true) {
		payload.serialNumber = nullableText(input.serialNumber, 'serialNumber', issues, 500);
	}
}

function normalizeJsonField(
	value: unknown | null | undefined,
	path: JsonFieldName,
	issues: ReturnType<typeof createIssues>,
): JsonObject | null {
	return jsonObject(value, path, issues);
}
