import type { OrganizationSettings } from '@simmer-mosquito/domain';
import type { LinkProps } from '@tanstack/react-router';
import type { RecordType } from '../../lib/record-nouns';
import type { FilterCodecs, FilterCounting, SearchCodec } from '../../lib/search-filters';

/** The two surfaces a record set is drawn on. */
export type RecordSetSurface = 'map' | 'table';

/**
 * A path in the generated route tree. `LinkProps['to']` is the router's own
 * answer, so a path the tree does not hold fails `tsc` where it is written.
 */
type RoutePath = NonNullable<LinkProps['to']>;

/**
 * Which surfaces apply a filter key: `both`, or the one surface that does.
 *
 * **A surface holds only the keys it applies.** A key the target surface does
 * not apply is dropped on the way there, and the surface reads, writes and
 * counts it as though it sat at its default, so no filter sits on the URL with
 * nothing on screen showing it, clearing it or narrowing the rows by it
 * (#1419). The Inspections Table has no Region control and the Service
 * Requests Table has none for Search, Tags or Region, so those keys are `map`
 * and a switch to the Table leaves them behind.
 */
export type AppliedOn = 'both' | RecordSetSurface;

/**
 * What a set's defaults and counting read besides the URL: the Organization's
 * today, which a date window ends on, and its settings, which say whether a
 * filter such as Overdue narrows anything at all.
 */
export interface RecordSetContext {
	readonly today: string;
	readonly settings: OrganizationSettings;
}

/** The filter keys whose value is a string, which is what a search box writes. */
type TextKey<TFilters> = {
	[Key in keyof TFilters]-?: TFilters[Key] extends string ? Key : never;
}[keyof TFilters] &
	string;

/** The filter a search box writes, and how long it waits before committing. */
interface TextSearch<TFilters> {
	readonly key: TextKey<TFilters>;
	/** `useDebouncedTextFilter`'s delay. Left out, it takes that hook's default. */
	readonly delayMs?: number;
}

/**
 * The half of a record set the switch reads: where the two surfaces are, the
 * params they share, and which surface applies each one.
 */
export interface RecordSetLinks<TFilters> {
	/** The record type, which names the switch through the noun register. */
	readonly recordType: RecordType;
	readonly paths: { readonly [Surface in RecordSetSurface]: RoutePath };
	readonly codecs: FilterCodecs<TFilters>;
	readonly applies: { readonly [Key in keyof TFilters]-?: AppliedOn };
}

/**
 * One Map/Table pair over one record type and one filter contract.
 *
 * `TFilters` is inferred from `codecs` alone, so everything else is checked
 * against it rather than widening it: a misspelled key and a missing key both
 * fail.
 */
export interface RecordSet<TFilters> extends RecordSetLinks<TFilters> {
	/**
	 * What an address with no filter params means on `surface`. A set whose two
	 * surfaces open on different windows says so here, and it is the only place
	 * that reads the surface.
	 */
	readonly defaults: (context: RecordSetContext, surface: RecordSetSurface) => TFilters;
	/** How the set counts what is set, where listing the filters cannot say. */
	readonly counting?:
		| FilterCounting<TFilters>
		| ((context: RecordSetContext) => FilterCounting<TFilters>);
	/** The filter a search box writes, for a set that has one. */
	readonly textSearch?: TextSearch<TFilters>;
}

/**
 * Declares a record set. An identity at runtime; what it adds is the
 * inference, so every other field is read against the keys `codecs` declares.
 */
export function defineRecordSet<TFilters>(
	definition: Omit<RecordSetLinks<TFilters>, 'applies'> & {
		readonly applies: { readonly [Key in keyof NoInfer<TFilters>]-?: AppliedOn };
		readonly defaults: (context: RecordSetContext, surface: RecordSetSurface) => NoInfer<TFilters>;
		readonly counting?:
			| FilterCounting<NoInfer<TFilters>>
			| ((context: RecordSetContext) => FilterCounting<NoInfer<TFilters>>);
		readonly textSearch?: TextSearch<NoInfer<TFilters>>;
	},
): RecordSet<TFilters> {
	return definition;
}

/** Whether `surface` applies a filter applied on `appliedOn`. */
export function surfaceApplies(appliedOn: AppliedOn, surface: RecordSetSurface): boolean {
	return appliedOn === 'both' || appliedOn === surface;
}

/** A codec that reads and writes nothing, for a key a surface does not apply. */
const NOT_APPLIED: SearchCodec<unknown> = {
	decode: () => undefined,
	encode: () => undefined,
};

/**
 * The set's codecs as `surface` reads them. A key the surface does not apply
 * decodes to nothing and encodes to nothing, so it resolves to its default, a
 * `searchValidator` built from these drops it from the address, and a write to
 * it removes the param rather than setting it.
 */
export function surfaceCodecs<TFilters>(
	set: RecordSetLinks<TFilters>,
	surface: RecordSetSurface,
): FilterCodecs<TFilters> {
	const codecs: Record<string, SearchCodec<unknown>> = {
		...(set.codecs as Record<string, SearchCodec<unknown>>),
	};
	for (const key of Object.keys(codecs) as (keyof TFilters & string)[]) {
		if (!surfaceApplies(set.applies[key], surface)) {
			codecs[key] = NOT_APPLIED;
		}
	}
	return codecs as FilterCodecs<TFilters>;
}

/** The set's counting rule in `context`, or none for a set that states none. */
export function recordSetCounting<TFilters>(
	set: RecordSet<TFilters>,
	context: RecordSetContext,
): FilterCounting<TFilters> | undefined {
	return typeof set.counting === 'function' ? set.counting(context) : set.counting;
}

/**
 * The params a move to `target` carries: each filter key the target applies,
 * as the source surface's validated search holds it. Everything else stays
 * behind, a filter the target does not apply and a param that is not a filter,
 * such as a page or an order. The search is the validated one, so a filter at
 * its default is already off it and stays off the destination's address.
 */
export function carriedSearch<TFilters>(
	set: RecordSetLinks<TFilters>,
	search: Record<string, unknown>,
	target: RecordSetSurface,
): Record<string, unknown> {
	const carried: Record<string, unknown> = {};
	for (const key of Object.keys(set.codecs) as (keyof TFilters & string)[]) {
		const value = search[key];
		if (value !== undefined && surfaceApplies(set.applies[key], target)) {
			carried[key] = value;
		}
	}
	return carried;
}
