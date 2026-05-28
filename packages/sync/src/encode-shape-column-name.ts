export function encodeShapeColumnName(value: string): string {
	return value.replace(/([A-Z])|([0-9])/g, (_match, letter, digit) => {
		return `_${letter ? letter.toLowerCase() : digit}`;
	});
}
