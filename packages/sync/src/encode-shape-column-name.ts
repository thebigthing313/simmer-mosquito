export function encodeShapeColumnName(value: string): string {
	// The Electric subset-where compiler emits SQL keywords/operators (e.g. ANY,
	// AND, LIKE) and then re-maps identifier tokens through this encoder. Column
	// names are lowerCamelCase, never all-uppercase, so leave all-caps tokens alone
	// to avoid turning `ANY` into the invalid `_a_n_y`.
	if (/^[A-Z]+$/.test(value)) {
		return value;
	}

	return value.replace(/([A-Z])|([0-9])/g, (_match, letter, digit) => {
		return `_${letter ? letter.toLowerCase() : digit}`;
	});
}
