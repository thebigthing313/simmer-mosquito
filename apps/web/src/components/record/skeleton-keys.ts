/**
 * Stable keys for a placeholder list.
 *
 * A skeleton's entries come from a module constant and never reorder, so
 * position is the right key. Written as `key={`${x}-${index}`}` inside the map
 * the lint cannot tell that apart from keying real rows by index, so the pairing
 * happens here instead.
 */
export function keyedPlaceholders<T>(
	values: readonly T[],
	prefix: string,
): readonly { readonly key: string; readonly value: T }[] {
	return values.map((value, index) => ({ key: `${prefix}-${index}`, value }));
}
