export function decodeShapeColumnName(value: string): string {
	return value.replace(/_([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}
