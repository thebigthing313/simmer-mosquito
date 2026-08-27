/**
 * Building a tile-filter object out of the filters a reader has actually set.
 *
 * An absent filter has to leave its key out rather than send `undefined`: the
 * tile filter types declare optional keys without `| undefined`, and the
 * workspace is on `exactOptionalPropertyTypes`, so `{ isWet: undefined }` does
 * not typecheck. That forces the conditional-spread idiom, and an explorer with
 * eight filters spreads eight ternaries into one literal.
 *
 * These give that shape one name each, so the literal reads as the filters it
 * carries rather than as a column of `x === '' ? {} : { x }`.
 */

/** The ids under `key`, or nothing when none are selected. */
export function whenAny<K extends string>(
	key: K,
	ids: ReadonlySet<string>,
): Record<K, readonly string[]> | Record<string, never> {
	return ids.size === 0 ? {} : ({ [key]: [...ids] } as unknown as Record<K, readonly string[]>);
}

/** The text under `key`, or nothing when it is blank. */
export function whenText<K extends string>(
	key: K,
	value: string,
): Record<K, string> | Record<string, never> {
	return value === '' ? {} : ({ [key]: value } as unknown as Record<K, string>);
}

/** `key: true`, or nothing. A false flag is not a filter. */
export function whenOn<K extends string>(
	key: K,
	value: boolean,
): Record<K, true> | Record<string, never> {
	return value ? ({ [key]: true } as unknown as Record<K, true>) : {};
}
