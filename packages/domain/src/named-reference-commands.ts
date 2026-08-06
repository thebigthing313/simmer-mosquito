import {
	type AgencyCommandContextInput,
	type AgencyCommandContextPayload,
	createIssues,
	jsonObject,
	nullableText,
	requiredText,
	requiredUuid,
	throwIfIssues,
	validateAgencyCommandContext,
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
	AgencyCommandContextInput & {
		readonly name: string;
		readonly description?: TFields['description'] extends true ? string | null : never;
		readonly customSchema?: TFields['customSchema'] extends true ? unknown | null : never;
		readonly metadata?: TFields['metadata'] extends true ? unknown | null : never;
		readonly actionThreshold?: TFields['actionThreshold'] extends true ? number | null : never;
		readonly serialNumber?: TFields['serialNumber'] extends true ? string | null : never;
	};

export type NamedReferenceUpdateInput<TFields extends NamedReferenceFieldSet> =
	AgencyCommandContextInput & {
		readonly name?: string;
		readonly description?: TFields['description'] extends true ? string | null : never;
		readonly customSchema?: TFields['customSchema'] extends true ? unknown | null : never;
		readonly metadata?: TFields['metadata'] extends true ? unknown | null : never;
		readonly actionThreshold?: TFields['actionThreshold'] extends true ? number | null : never;
		readonly serialNumber?: TFields['serialNumber'] extends true ? string | null : never;
		readonly acknowledgedHistoricalLabelChange?: boolean;
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

export type NamedReferenceUpdateChanges<TFields extends NamedReferenceFieldSet> = {
	readonly name?: string;
} & (TFields['description'] extends true ? { readonly description?: string | null } : EmptyRecord) &
	(TFields['customSchema'] extends true
		? { readonly customSchema?: JsonObject | null }
		: EmptyRecord) &
	(TFields['metadata'] extends true ? { readonly metadata?: JsonObject | null } : EmptyRecord) &
	(TFields['actionThreshold'] extends true
		? { readonly actionThreshold?: number | null }
		: EmptyRecord) &
	(TFields['serialNumber'] extends true ? { readonly serialNumber?: string | null } : EmptyRecord);

export type NamedReferenceUpdatePayload<TFields extends NamedReferenceFieldSet> = {
	readonly changes: Readonly<NamedReferenceUpdateChanges<TFields>>;
	readonly acknowledgedHistoricalLabelChange: boolean;
};

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
	readonly payload: AgencyCommandContextPayload &
		Record<TIdKey, string> &
		NamedReferenceCreatePayload<TFields>;
}> {
	const { type, input, idKey, fields } = options;
	const issues = createIssues();
	const context = validateAgencyCommandContext(input, issues);
	const id = requiredUuid(input[idKey], idKey, issues);
	const payload = normalizeCreatePayload(input, fields, issues);
	throwIfIssues(options.message ?? `${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: { ...context, [idKey]: id, ...payload } as AgencyCommandContextPayload &
			Record<TIdKey, string> &
			NamedReferenceCreatePayload<TFields>,
	};
}

export function updateNamedReferenceCommand<
	TType extends string,
	TIdKey extends string,
	TFields extends NamedReferenceFieldSet,
>(
	options: Readonly<{
		type: TType;
		input: NamedReferenceUpdateInput<TFields> & Record<TIdKey, string | null | undefined>;
		idKey: TIdKey;
		fields: TFields;
		changeNoun: string;
		message?: string;
	}>,
): Readonly<{
	readonly type: TType;
	readonly payload: AgencyCommandContextPayload &
		Record<TIdKey, string> &
		NamedReferenceUpdatePayload<TFields>;
}> {
	const { type, input, idKey, fields } = options;
	const issues = createIssues();
	const context = validateAgencyCommandContext(input, issues);
	const id = requiredUuid(input[idKey], idKey, issues);
	const changes = normalizeUpdateChanges(input, fields, options.changeNoun, issues);
	throwIfIssues(options.message ?? `${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: {
			...context,
			[idKey]: id,
			changes,
			acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalLabelChange ?? false,
		} as AgencyCommandContextPayload &
			Record<TIdKey, string> &
			NamedReferenceUpdatePayload<TFields>,
	};
}

export function namedReferenceIdCommand<TType extends string, TIdKey extends string>(
	options: Readonly<{
		type: TType;
		input: AgencyCommandContextInput & Record<TIdKey, string | null | undefined>;
		idKey: TIdKey;
		message?: string;
	}>,
): Readonly<{
	readonly type: TType;
	readonly payload: AgencyCommandContextPayload & Record<TIdKey, string>;
}> {
	const { type, input, idKey } = options;
	const issues = createIssues();
	const context = validateAgencyCommandContext(input, issues);
	const id = requiredUuid(input[idKey], idKey, issues);
	throwIfIssues(options.message ?? `${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: { ...context, [idKey]: id } as AgencyCommandContextPayload & Record<TIdKey, string>,
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

function normalizeUpdateChanges<TFields extends NamedReferenceFieldSet>(
	input: NamedReferenceUpdateInput<TFields>,
	fields: TFields,
	changeNoun: string,
	issues: ReturnType<typeof createIssues>,
): Readonly<NamedReferenceUpdateChanges<TFields>> {
	const hasName = input.name !== undefined;
	const hasDescription = fields.description === true && input.description !== undefined;
	const hasCustomSchema = fields.customSchema === true && input.customSchema !== undefined;
	const hasMetadata = fields.metadata === true && input.metadata !== undefined;
	const hasActionThreshold = fields.actionThreshold === true && input.actionThreshold !== undefined;
	const hasSerialNumber = fields.serialNumber === true && input.serialNumber !== undefined;
	if (
		!hasName &&
		!hasDescription &&
		!hasCustomSchema &&
		!hasMetadata &&
		!hasActionThreshold &&
		!hasSerialNumber
	) {
		issues.push({ path: 'changes', message: `At least one ${changeNoun} field must change.` });
	}

	const changes: Record<string, unknown> = {};
	if (hasName) {
		changes.name = requiredText(input.name, 'name', issues, 200);
	}
	addConfiguredFieldChanges(changes, input, fields, issues);
	return changes as Readonly<NamedReferenceUpdateChanges<TFields>>;
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

function addConfiguredFieldChanges<TFields extends NamedReferenceFieldSet>(
	changes: Record<string, unknown>,
	input: NamedReferenceUpdateInput<TFields>,
	fields: TFields,
	issues: ReturnType<typeof createIssues>,
): void {
	if (fields.description === true && input.description !== undefined) {
		changes.description = nullableText(input.description, 'description', issues, 2_000);
	}
	if (fields.customSchema === true && input.customSchema !== undefined) {
		changes.customSchema = normalizeJsonField(input.customSchema, 'customSchema', issues);
	}
	if (fields.metadata === true && input.metadata !== undefined) {
		changes.metadata = normalizeJsonField(input.metadata, 'metadata', issues);
	}
	if (fields.actionThreshold === true && input.actionThreshold !== undefined) {
		changes.actionThreshold = nullableNonnegativeInteger(
			input.actionThreshold,
			'actionThreshold',
			issues,
		);
	}
	if (fields.serialNumber === true && input.serialNumber !== undefined) {
		changes.serialNumber = nullableText(input.serialNumber, 'serialNumber', issues, 500);
	}
}

function normalizeJsonField(
	value: unknown | null | undefined,
	path: JsonFieldName,
	issues: ReturnType<typeof createIssues>,
): JsonObject | null {
	return jsonObject(value, path, issues);
}

function nullableNonnegativeInteger(
	value: number | null | undefined,
	path: string,
	issues: ReturnType<typeof createIssues>,
): number | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!Number.isInteger(value) || value < 0) {
		issues.push({ path, message: `${path} must be a nonnegative integer or null.` });
	}
	return value;
}

function humanizeCommandType(type: string): string {
	const command = type.split('.').at(-1) ?? type;
	return command.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}
