/**
 * Pure reconciliation between an agency's custom schema (a lookup row's
 * `customSchema`) and a record's `metadata` column.
 *
 * Kept free of React so both the editor ({@link ../field-components/metadata-field})
 * and read-only surfaces (detail pages) share one interpretation of a schema —
 * including which shape it is written in and how orphaned values are treated.
 */

export type MetadataValue = Record<string, unknown> | null;

export type MetadataValueType = 'text' | 'number' | 'integer' | 'boolean' | 'date';

/** One field a custom schema declares, normalized across both schema shapes. */
export interface CustomFieldDescriptor {
	readonly key: string;
	readonly label: string;
	readonly required: boolean;
	readonly valueType: MetadataValueType;
}

/**
 * A schema field paired with the record's value for it. `declared: false` marks a
 * value whose key the schema no longer declares — kept visible so history written
 * under an older schema is never silently hidden.
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

	if (isPlainJsonObject(schema.properties)) {
		const required = Array.isArray(schema.required)
			? new Set(schema.required.filter((item): item is string => typeof item === 'string'))
			: new Set<string>();
		return Object.entries(schema.properties).map(([key, property]) => ({
			key,
			label: labelFromFieldKey(key),
			required: required.has(key),
			valueType: metadataValueTypeFromProperty(property),
		}));
	}

	return Object.entries(schema)
		.map(([key, config]) => {
			const configObject = isPlainJsonObject(config) ? config : {};
			return {
				key,
				label: typeof configObject.label === 'string' ? configObject.label : labelFromFieldKey(key),
				order: numericOrder(configObject.order),
				required: configObject.required === true,
				valueType: metadataValueTypeFromValue(configObject.type),
			};
		})
		.sort((first, second) => first.order - second.order);
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

function numericOrder(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
