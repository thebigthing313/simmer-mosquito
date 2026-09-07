/**
 * Pure reconciliation between an organization's custom schema (a lookup row's
 * `customSchema`) and a record's `metadata` column.
 *
 * Kept free of React so that one interpretation of a schema serves all three
 * readers: the schema editor ({@link ../field-components/json-schema-field}),
 * the record editor ({@link ../field-components/metadata-field}) and the
 * read-only detail pages. That covers which shape the document is written in,
 * how orphaned values are treated, and where a field's answers are stored.
 */

export type MetadataValue = Record<string, unknown> | null;

export type MetadataValueType = 'text' | 'number' | 'integer' | 'boolean' | 'date';

/**
 * One field a custom schema declares, normalized across both schema shapes.
 *
 * `key` is where a record's answer is stored in `metadata`, so it is the part
 * that has to survive everything else changing. Display order is the order of
 * the list a reader is handed and is not a property of a field.
 */
export interface CustomFieldDescriptor {
	readonly key: string;
	readonly label: string;
	readonly required: boolean;
	readonly valueType: MetadataValueType;
}

/**
 * A field on its way back into a schema. `key: null` is a field somebody has
 * just added, which has never been stored and so has no key yet.
 */
export interface CustomFieldDraft {
	readonly key: string | null;
	readonly label: string;
	readonly required: boolean;
	readonly valueType: MetadataValueType;
}

/**
 * A schema field paired with the record's value for it. `declared: false` marks a
 * value whose key the schema no longer declares — kept visible so history written
 * under an older schema is never silently hidden.
 *
 * Keeping it visible is the whole of what happens to it. Whether an already
 * orphaned value should be moved back under the field it was written for was
 * measured on 2026-09-07 and closed as #753: zero orphans across all six record
 * kinds, against 993 values of which every one was declared, so there was
 * nothing to repair and no migration or remapping screen was built. #622 is what
 * stopped a rename orphaning a value in the first place.
 */
export interface CustomFieldEntry extends CustomFieldDescriptor {
	readonly declared: boolean;
	readonly value: unknown;
}

/**
 * The fields a custom schema declares, in display order. Handles both the shape
 * the JSON schema editor writes (`{ key: { label, type, order, required } }`) and
 * legacy JSON-Schema blobs (`{ properties, required }`).
 */
export function customFieldDescriptors(schema: unknown): readonly CustomFieldDescriptor[] {
	if (!isPlainJsonObject(schema)) {
		return [];
	}

	return isPlainJsonObject(schema.properties)
		? descriptorsFromJsonSchema(schema)
		: descriptorsFromFieldMap(schema);
}

/** The `{ properties, required }` shape, in the order the properties are written. */
function descriptorsFromJsonSchema(
	schema: Record<string, unknown>,
): readonly CustomFieldDescriptor[] {
	const properties = isPlainJsonObject(schema.properties) ? schema.properties : {};
	const required = Array.isArray(schema.required)
		? new Set(schema.required.filter((item): item is string => typeof item === 'string'))
		: new Set<string>();

	return Object.entries(properties).map(([key, property]) => ({
		key,
		label: labelFromFieldKey(key),
		required: required.has(key),
		valueType: metadataValueTypeFromProperty(property),
	}));
}

/** The `{ key: { label, order, type, required } }` shape the editor writes. */
function descriptorsFromFieldMap(
	schema: Record<string, unknown>,
): readonly CustomFieldDescriptor[] {
	return Object.entries(schema)
		.map(([key, config]) => ({ key, ...fieldMapEntry(key, config) }))
		.sort((first, second) => first.order - second.order)
		.map(({ key, label, required, valueType }) => ({ key, label, required, valueType }));
}

function fieldMapEntry(
	key: string,
	config: unknown,
): { label: string; order: number; required: boolean; valueType: MetadataValueType } {
	// A hand-written `{ count: 'number' }` names the type and nothing else.
	if (!isPlainJsonObject(config)) {
		return {
			label: labelFromFieldKey(key),
			order: Number.MAX_SAFE_INTEGER,
			required: false,
			valueType: metadataValueTypeFromValue(config),
		};
	}

	return {
		label: typeof config.label === 'string' ? config.label : labelFromFieldKey(key),
		order: numericOrder(config.order),
		required: config.required === true,
		valueType: metadataValueTypeFromValue(config.type),
	};
}

/**
 * The schema document those fields describe, in the flat shape
 * `{ key: { label, order, type, required } }`.
 *
 * A field that already has a key keeps it, so renaming one changes its label
 * and leaves every record's stored answer where it is. Only a field with no key
 * gets one derived from its label, and a derived key that collides with another
 * field's is given a numeric suffix. A field with a blank label is dropped, and
 * a document with no fields left is null.
 */
export function customSchemaFromFields(fields: readonly CustomFieldDraft[]): MetadataValue {
	const namedFields = fields
		.map((field) => ({ ...field, label: field.label.trim() }))
		.filter((field) => field.label.length > 0);
	if (namedFields.length === 0) {
		return null;
	}

	const usedKeys = new Set(
		namedFields
			.map((field) => field.key)
			.filter((key): key is string => key !== null && key.length > 0),
	);

	const schema: Record<string, unknown> = {};
	namedFields.forEach((field, index) => {
		const key =
			field.key !== null && field.key.length > 0
				? field.key
				: reserveFieldKey(fieldKeyFromLabel(field.label), usedKeys);
		schema[key] = {
			label: field.label,
			order: index,
			type: field.valueType,
			required: field.required,
		};
	});

	return schema;
}

/**
 * Every declared field (in schema order) followed by any metadata key the schema
 * does not declare. Declared fields appear even when the record has no value, so a
 * reader can see what the method asks for and what is still missing.
 */
export function customFieldEntries(
	schema: unknown,
	metadata: unknown,
): readonly CustomFieldEntry[] {
	const values = asMetadataValue(metadata) ?? {};
	const descriptors = customFieldDescriptors(schema);
	const declaredKeys = new Set(descriptors.map((descriptor) => descriptor.key));

	return [
		...descriptors.map((descriptor) => ({
			...descriptor,
			declared: true,
			value: values[descriptor.key],
		})),
		...Object.entries(values)
			.filter(([key]) => !declaredKeys.has(key))
			.map(([key, value]) => ({
				key,
				label: labelFromFieldKey(key),
				required: false,
				valueType: 'text' as const,
				declared: false,
				value,
			})),
	];
}

/** How many fields a custom schema declares — for "3 fields" catalog badges. */
export function customFieldCount(schema: unknown): number {
	return customFieldDescriptors(schema).length;
}

/**
 * The custom schema of the lookup row `id` points at, or null when nothing is
 * selected or the row carries no schema.
 */
export function customSchemaFor(
	rows: readonly { readonly id: string; readonly customSchema?: unknown }[],
	id: string | null,
): MetadataValue {
	if (id === null || id === '') {
		return null;
	}
	const schema = rows.find((row) => row.id === id)?.customSchema;
	return isPlainJsonObject(schema) ? schema : null;
}

/** Narrow a record's stored `metadata` column down to a plain JSON object. */
export function asMetadataValue(metadata: unknown): MetadataValue {
	return isPlainJsonObject(metadata) ? metadata : null;
}

/** True when a custom-field value was actually filled in. */
export function hasCustomFieldValue(value: unknown): boolean {
	return value !== null && value !== undefined && String(value).trim().length > 0;
}

/** Render a stored custom-field value for display. Yes/no fields read as words. */
export function formatCustomFieldValue(entry: CustomFieldEntry): string | null {
	if (!hasCustomFieldValue(entry.value)) {
		return null;
	}
	if (typeof entry.value === 'boolean') {
		return entry.value ? 'Yes' : 'No';
	}
	return String(entry.value);
}

function labelFromFieldKey(key: string): string {
	const spaced = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim();
	return spaced.length === 0 ? '' : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function metadataValueTypeFromProperty(schema: unknown): MetadataValueType {
	if (!isPlainJsonObject(schema)) {
		return 'text';
	}
	if (schema.type === 'string' && schema.format === 'date') {
		return 'date';
	}
	return metadataValueTypeFromValue(schema.type);
}

function metadataValueTypeFromValue(value: unknown): MetadataValueType {
	if (value === 'string' || value === 'text') {
		return 'text';
	}

	return value === 'number' || value === 'integer' || value === 'boolean' || value === 'date'
		? value
		: 'text';
}

/** The camelCase key a label suggests, for a field that has never had one. */
function fieldKeyFromLabel(label: string): string {
	const parts = label
		.trim()
		.split(/[^a-zA-Z0-9]+/g)
		.filter((part) => part.length > 0);
	const [first = 'field', ...rest] = parts;
	const key = [
		first.toLowerCase(),
		...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()),
	].join('');
	return key.length === 0 ? 'field' : key;
}

function reserveFieldKey(baseKey: string, usedKeys: Set<string>): string {
	let key = baseKey;
	let suffix = 2;
	while (usedKeys.has(key)) {
		key = `${baseKey}${suffix}`;
		suffix += 1;
	}
	usedKeys.add(key);
	return key;
}

function numericOrder(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
