import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Explorer filter state, held in the URL rather than in the component.
 *
 * An explorer's filters are part of where the operator is, not just how the page
 * looks. Held in component state they are lost the moment anything navigates:
 * open a record, press Back, and the list they had narrowed to comes back reset.
 * They also cannot be handed to a colleague, or kept in a bookmark, or reached
 * again after a reload.
 *
 * A filter change replaces the history entry rather than pushing one, so Back
 * still means "the page before this one" instead of walking backwards through
 * every checkbox the operator ticked.
 */

export interface SearchCodec<TValue> {
	/** Read a raw search value. Must never throw — a hand-edited URL is input. */
	readonly decode: (raw: unknown) => TValue | undefined;
	/** Return `undefined` to leave the param out: a default does not belong in the URL. */
	readonly encode: (value: TValue) => unknown;
}

export type FilterCodecs<TFilters> = {
	readonly [Key in keyof TFilters]: SearchCodec<TFilters[Key]>;
};

export interface SearchFilters<TFilters> {
	readonly filters: TFilters;
	/** Apply one or more changes in a single navigation. */
	readonly setFilters: (patch: Partial<TFilters>) => void;
	/** Drop every filter param, returning the explorer to its defaults. */
	readonly reset: () => void;
	/** How many filters are set, for the collapsed panel and the filter control. */
	readonly activeCount: number;
}

/**
 * The two counting rules a surface cannot state by listing its filters.
 *
 * Everything else is derived: a filter at its default counts nothing, a
 * selection counts how many are selected, and anything else counts one.
 */
export interface FilterCounting<TFilters> {
	/**
	 * Keys that count as one filter together, such as a date range's two bounds.
	 * The group counts one as soon as either end moves.
	 */
	readonly groups?: readonly (readonly (keyof TFilters & string)[])[];
	/**
	 * Keys that carry no count at all, for a surface whose controls are the page
	 * rather than a way of narrowing it. Opting out is written down here so a new
	 * filter cannot go uncounted by being forgotten.
	 */
	readonly uncounted?: readonly (keyof TFilters & string)[];
}

/**
 * A date range's two bounds are one filter, not two.
 *
 * Every explorer that opens on a window spells its bounds `from` and `to`, so
 * the grouping is the same declaration on all of them.
 */
export const DATE_RANGE_COUNTING = { groups: [['from', 'to']] } as const;

/**
 * Bind a filter set to the current route's search params.
 *
 * `defaults`, `codecs` and `counting` must be stable across renders — module
 * constants, or `useMemo`'d where a default is derived (today's date, say).
 */
export function useSearchFilters<TFilters extends object>(
	defaults: TFilters,
	codecs: FilterCodecs<TFilters>,
	counting?: FilterCounting<TFilters>,
): SearchFilters<TFilters> {
	const search = useSearch({ strict: false }) as Record<string, unknown>;
	const navigate = useNavigate();

	const filters = useMemo(
		() => resolveFilters(defaults, codecs, search),
		[search, defaults, codecs],
	);

	const setFilters = useCallback(
		(patch: Partial<TFilters>) => {
			navigate({
				replace: true,
				search: (previous: Record<string, unknown>) => {
					const result: Record<string, unknown> = { ...previous };
					for (const key of filterKeys(patch)) {
						const value = patch[key];
						if (value === undefined) {
							continue;
						}
						const encoded = codecs[key].encode(value);
						if (encoded === undefined) {
							delete result[key];
						} else {
							result[key] = encoded;
						}
					}
					return result;
				},
				// This navigates within whatever route mounted the hook, which the
				// router's typed `to` cannot express from a shared helper.
			} as never);
		},
		[navigate, codecs],
	);

	const reset = useCallback(() => {
		navigate({
			replace: true,
			search: (previous: Record<string, unknown>) => {
				const result: Record<string, unknown> = { ...previous };
				for (const key of filterKeys(defaults)) {
					delete result[key];
				}
				return result;
			},
		} as never);
	}, [navigate, defaults]);

	const activeCount = useMemo(
		() => countActiveFilters(defaults, filters, counting),
		[defaults, filters, counting],
	);

	return { filters, setFilters, reset, activeCount };
}

/**
 * How many of a surface's filters are set.
 *
 * The count is load-bearing: a collapsed panel shows it, so a reader can tell an
 * empty map from a filtered one, and the filter control carries it while the
 * filter card is away. It is derived from the same `defaults` the hook resolves
 * and resets with, because a surface that sums its own drifts from the rest.
 * Service Requests and Requests for Control once counted their default Open
 * status as set, and Requests for Control left its date window out of the count
 * altogether.
 */
export function countActiveFilters<TFilters extends object>(
	defaults: TFilters,
	filters: TFilters,
	counting: FilterCounting<TFilters> = {},
): number {
	const spokenFor = new Set<string>(counting.uncounted ?? []);
	let count = 0;

	for (const group of counting.groups ?? []) {
		let moved = false;
		for (const key of group) {
			spokenFor.add(key);
			moved = moved || !isDefaultValue(filters[key], defaults[key]);
		}
		count += moved ? 1 : 0;
	}

	for (const key of filterKeys(defaults)) {
		if (spokenFor.has(key)) {
			continue;
		}
		count += countOneFilter(filters[key], defaults[key]);
	}

	return count;
}

function countOneFilter(value: unknown, fallback: unknown): number {
	if (isDefaultValue(value, fallback)) {
		return 0;
	}
	if (value instanceof Set) {
		return value.size;
	}
	return Array.isArray(value) ? value.length : 1;
}

function isDefaultValue(value: unknown, fallback: unknown): boolean {
	if (value instanceof Set && fallback instanceof Set) {
		return value.size === fallback.size && [...value].every((member) => fallback.has(member));
	}
	if (Array.isArray(value) && Array.isArray(fallback)) {
		return (
			value.length === fallback.length &&
			value.every((member, index) => Object.is(member, fallback[index]))
		);
	}
	return Object.is(value, fallback);
}

type Mutable<TValue> = { -readonly [Key in keyof TValue]: TValue[Key] };

function filterKeys<TFilters extends object>(source: TFilters): (keyof TFilters & string)[] {
	return Object.keys(source) as (keyof TFilters & string)[];
}

function resolveFilters<TFilters extends object>(
	defaults: TFilters,
	codecs: FilterCodecs<TFilters>,
	raw: Record<string, unknown>,
): TFilters {
	const resolved: Mutable<TFilters> = { ...defaults };
	for (const key of filterKeys(defaults)) {
		const decoded = codecs[key].decode(raw[key]);
		if (decoded !== undefined) {
			resolved[key] = decoded;
		}
	}
	return resolved;
}

/**
 * A `validateSearch` built from the same codecs the page reads with.
 *
 * Junk is dropped rather than rejected — a truncated or hand-edited URL should
 * land the operator on the explorer's defaults, not an error boundary.
 */
export function searchValidator<TFilters extends object>(
	codecs: FilterCodecs<TFilters>,
): (search: Record<string, unknown>) => Record<string, unknown> {
	return (search) => {
		const result: Record<string, unknown> = {};
		for (const key of filterKeys(codecs)) {
			const codec = codecs[key];
			const decoded = codec.decode(search[key]);
			if (decoded === undefined) {
				continue;
			}
			const encoded = codec.encode(decoded);
			if (encoded !== undefined) {
				result[key] = encoded;
			}
		}
		return result;
	};
}

/**
 * A text filter that types locally and lands in the URL on a pause.
 *
 * Committing per keystroke would put a navigation behind every letter, and the
 * list would re-query on each one. `clear` only resets the input — the caller's
 * `reset` is what drops the param.
 */
export function useDebouncedTextFilter(
	urlValue: string,
	commit: (next: string) => void,
	delayMs = 250,
): {
	readonly input: string;
	readonly setInput: (next: string) => void;
	readonly clear: () => void;
} {
	const [input, setInputState] = useState(urlValue);
	const timer = useRef<number | undefined>(undefined);
	const isEditing = useRef(false);

	// Back/forward, or a filter reset, changes the URL from outside. Adopt it
	// unless the operator is mid-edit, which would yank the text they are typing.
	useEffect(() => {
		if (!isEditing.current) {
			setInputState(urlValue);
		}
	}, [urlValue]);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	const setInput = useCallback(
		(next: string) => {
			setInputState(next);
			isEditing.current = true;
			window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => {
				isEditing.current = false;
				commit(next.trim());
			}, delayMs);
		},
		[commit, delayMs],
	);

	const clear = useCallback(() => {
		window.clearTimeout(timer.current);
		isEditing.current = false;
		setInputState('');
	}, []);

	return { input, setInput, clear };
}

// --- codecs -----------------------------------------------------------------

/** Free text. Blank drops the param. */
export const textParam: SearchCodec<string> = {
	decode: (raw) => (typeof raw === 'string' && raw.trim() !== '' ? raw : undefined),
	encode: (value) => (value.trim() === '' ? undefined : value),
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `YYYY-MM-DD` bound, or `any` for no bound at all.
 *
 * "No bound" has to be spelled out rather than left blank: an absent param means
 * "use the default window", and an explorer set to All time would otherwise come
 * back from a reload narrowed to the last thirty days.
 */
export const dateParam: SearchCodec<string> = {
	decode: (raw) => {
		if (raw === 'any' || raw === '') {
			return '';
		}
		return typeof raw === 'string' && ISO_DATE.test(raw) ? raw : undefined;
	},
	encode: (value) => (value === '' ? 'any' : ISO_DATE.test(value) ? value : undefined),
};

/** A flag that is only ever in the URL when it is on. */
export const flagParam: SearchCodec<boolean> = {
	decode: (raw) => (raw === true || raw === 'true' ? true : raw === false ? false : undefined),
	encode: (value) => (value ? true : undefined),
};

/** One of a fixed set. `fallback` is the value that stays out of the URL. */
export function choiceParam<TValue extends string>(
	values: readonly TValue[],
	fallback: TValue,
): SearchCodec<TValue> {
	return {
		decode: (raw) => (values.some((value) => value === raw) ? (raw as TValue) : undefined),
		encode: (value) => (value === fallback ? undefined : value),
	};
}

/** A selection of ids, as a set. Empty drops the param. */
export const idSetParam: SearchCodec<ReadonlySet<string>> = {
	decode: (raw) => {
		const ids = readStringList(raw);
		return ids === null || ids.length === 0 ? undefined : new Set(ids);
	},
	encode: (value) => (value.size === 0 ? undefined : [...value]),
};

/** A selection from a fixed set, as a set. Unknown members are dropped. */
export function choiceSetParam<TValue extends string>(
	values: readonly TValue[],
): SearchCodec<ReadonlySet<TValue>> {
	return {
		decode: (raw) => {
			const list = readStringList(raw);
			if (list === null) {
				return undefined;
			}
			const chosen = list.filter((value): value is TValue =>
				values.some((candidate) => candidate === value),
			);
			return chosen.length === 0 ? undefined : new Set(chosen);
		},
		encode: (value) => (value.size === 0 ? undefined : [...value]),
	};
}

/** Repeated params arrive as an array; a comma-joined string is accepted too. */
function readStringList(raw: unknown): string[] | null {
	const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : null;
	if (list === null) {
		return null;
	}
	return list.filter((value): value is string => typeof value === 'string' && value.trim() !== '');
}
