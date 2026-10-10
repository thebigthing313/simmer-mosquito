import type { LinkProps } from '@tanstack/react-router';
import type { RecordType } from '../../lib/record-nouns';
import type { FilterCodecs } from '../../lib/search-filters';

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
 * not apply is dropped on the way there, so there is no state in which a filter
 * sits on the URL with nothing on screen showing it, clearing it or narrowing
 * the rows by it (#1419). The Inspections Table has no Region control and the
 * Service Requests Table has none for Search, Tags or Region, so those keys are
 * `map` and a switch to the Table leaves them behind.
 */
export type RecordSetKeyTreatment = 'both' | RecordSetSurface;

/**
 * One Map/Table pair over one record type and one filter contract.
 *
 * `TFilters` is inferred from `codecs` alone, so `applies` is checked against
 * it rather than widening it: a misspelled key and a missing key both fail.
 */
export interface RecordSet<TFilters> {
	/** The record type, which names the switch through the noun register. */
	readonly recordType: RecordType;
	readonly paths: { readonly [Surface in RecordSetSurface]: RoutePath };
	readonly codecs: FilterCodecs<TFilters>;
	readonly applies: { readonly [Key in keyof TFilters]-?: RecordSetKeyTreatment };
}

/**
 * Declares a record set. An identity at runtime; what it adds is the
 * inference, so `applies` is read against the keys `codecs` declares.
 */
export function defineRecordSet<TFilters>(
	definition: Omit<RecordSet<TFilters>, 'applies'> & {
		readonly applies: { readonly [Key in keyof NoInfer<TFilters>]-?: RecordSetKeyTreatment };
	},
): RecordSet<TFilters> {
	return definition;
}

/** Whether `surface` applies the filter under `key`. */
function surfaceApplies(treatment: RecordSetKeyTreatment, surface: RecordSetSurface): boolean {
	return treatment === 'both' || treatment === surface;
}

/**
 * The params a move to `target` carries: each filter key the target applies,
 * as the source surface's validated search holds it. Everything else stays
 * behind, a filter the target does not apply and a param that is not a filter,
 * such as a page or an order. The search is the validated one, so a filter at
 * its default is already off it and stays off the destination's address.
 */
export function carriedSearch<TFilters>(
	set: RecordSet<TFilters>,
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
