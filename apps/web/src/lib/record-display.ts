/**
 * How a record's enum and metadata columns read in a table cell.
 *
 * Both started in the My Organization settings pages and are now read by the
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

/** Whether a `metadata` column holds a JSON object with anything in it. */
export function hasMetadata(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		Object.keys(value).length > 0
	);
}
