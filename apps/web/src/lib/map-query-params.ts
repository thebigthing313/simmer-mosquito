/** What a filter set contributes to a `/map/*` list request. */
export type MapQueryValue = string | number | boolean | readonly string[] | null | undefined;

/**
 * The filter params for a `/map/*` list request, with the empties dropped.
 *
 * An absent filter leaves its param out rather than sending a blank one: the
 * endpoints read presence, so `?regionId=` is not the same request as no
 * `regionId` at all.
 */
export function mapQueryParams(
	source: Readonly<Record<string, MapQueryValue>>,
): Readonly<Record<string, string>> {
	const params: Record<string, string> = {};
	for (const [key, value] of Object.entries(source)) {
		if (value === undefined || value === null) {
			continue;
		}
		if (Array.isArray(value)) {
			if (value.length > 0) {
				params[key] = value.join(',');
			}
			continue;
		}
		const text = String(value);
		if (text !== '') {
			params[key] = text;
		}
	}
	return params;
}
