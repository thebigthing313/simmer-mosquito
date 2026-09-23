/**
 * Any `HeadersInit` shape as a record with lowercased names, so records can be
 * merged by spreading with last-wins. Structural rather than `instanceof
 * Headers`, because three runtimes declare that global three ways. An array of
 * pairs keeps only the last value for a repeated name.
 */
export function headerEntries(source: unknown): Record<string, string> {
	const entries: Record<string, string> = {};
	const add = (value: string, key: string) => {
		entries[key.toLowerCase()] = value;
	};

	if (Array.isArray(source)) {
		for (const [key, value] of source as readonly (readonly [string, string])[]) {
			add(value, key);
		}

		return entries;
	}

	if (typeof source !== 'object' || source === null) {
		return entries;
	}

	const headers = source as {
		readonly forEach?: (fn: (value: string, key: string) => void) => void;
	};
	if (typeof headers.forEach !== 'function') {
		for (const [key, value] of Object.entries(source as Record<string, string>)) {
			add(value, key);
		}

		return entries;
	}

	headers.forEach(add);

	return entries;
}
