/**
 * How a record's enum and JSON columns read on a surface.
 *
 * These started in the My Organization settings pages and are now read by the
 * catalogs too, so they sit here rather than in one route's `-components`
 * folder, which is private to that route.
 */

/** A snake_case or kebab-case value as a label: `source_reduction` is `Source Reduction`. */
export function formatMode(value: string): string {
	return value
		.split(/[_-]/g)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

/**
 * A JSON column as an object, or nothing.
 *
 * `metadata` and `custom_schema` are `unknown`: nothing stops a row holding an
 * array or a number, and the fields that render them take an object or `null`.
 * Anything else reads as nothing, which is the answer the field would give it
 * anyway and one the user can replace.
 *
 * `MetadataValue` and `JsonSchemaValue` are both `Record<string, unknown> | null`,
 * so this assigns to either without a cast at the call site.
 */
export function jsonObjectValue(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** Whether a `metadata` column holds a JSON object with anything in it. */
export function hasMetadata(value: unknown): boolean {
	const object = jsonObjectValue(value);
	return object !== null && Object.keys(object).length > 0;
}
