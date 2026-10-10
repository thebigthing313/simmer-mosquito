import type { LarvalDensity } from './column-vocabularies.js';

/**
 * The filter contract of each `/map/*` surface, declared once.
 *
 * A surface's tile, extent and list requests all reach one server parser, and
 * the web builds all three from one filter object. Both halves used to write
 * the param names out by hand, the server as a field list and the web twice
 * more per surface, and nothing checked that the copies agreed (#1420). Here a
 * spec is the field list, `apps/server` builds its parser from it,
 * `encodeMapFilterParams` builds the web's query from it, and `MapFiltersOf`
 * is the filter object both sides type against.
 */

/**
 * A sample's lifecycle state as the explorer filters, colors and labels it.
 * The server resolves one status per sample; `packages/db` reads this list.
 */
export const SAMPLE_STATUSES = ['identified', 'awaiting', 'zero_larvae', 'unidentifiable'] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

/** How one param reads on the wire, and the value it carries in a filter object. */
export interface MapFilterKinds {
	readonly boolean: boolean;
	/** Sent only when true: `false` is the same request as leaving it out. */
	readonly trueOnly: boolean;
	/** Ids, sorted and comma-joined. */
	readonly uuidList: readonly string[];
	readonly text: string;
	/** A `YYYY-MM-DD` day. */
	readonly date: string;
	/** Density bands, sorted and comma-joined. */
	readonly density: readonly LarvalDensity[];
	readonly sampleStatus: SampleStatus;
	/** `active` for true, `inactive` for false. */
	readonly trapStatus: boolean;
	/** `open` for true, `closed` for false. */
	readonly requestStatus: boolean;
}

export type MapFilterKind = keyof MapFilterKinds;

/** One query param and the filter key it fills. */
export interface MapFilterField {
	/** The query param, as the client sends it. */
	readonly param: string;
	/** The filter key, when it differs from the param. */
	readonly as?: string;
	readonly kind: MapFilterKind;
}

export type MapFilterSpec = readonly MapFilterField[];

/** The filter key a field fills: its `as`, or its param when it has none. */
export type MapFilterKey<TField> = TField extends { readonly as: infer TKey extends string }
	? TKey
	: TField extends { readonly param: infer TKey extends string }
		? TKey
		: never;

/** The filter object a spec reads and writes, every field optional. */
export type MapFiltersOf<TSpec extends MapFilterSpec> = {
	readonly [TField in TSpec[number] as MapFilterKey<TField>]?: MapFilterKinds[TField['kind']];
};

/** The region filter is spatial, not an FK, and every record surface carries it. */
const REGION_FILTER = { param: 'regionId', as: 'regionIds', kind: 'uuidList' } as const;

/** An inclusive date window on the surface's operational date. */
const DATE_FILTERS = [
	{ param: 'dateFrom', kind: 'date' },
	{ param: 'dateTo', kind: 'date' },
] as const;

/** The technician narrowing the three performed-action surfaces share. */
const TECHNICIAN_FILTER = {
	param: 'technician',
	as: 'technicianProfileIds',
	kind: 'uuidList',
} as const;

const SEARCH_FILTER = { param: 'search', kind: 'text' } as const;

export const HABITAT_MAP_FILTERS = [
	{ param: 'isActive', kind: 'boolean' },
	{ param: 'isInaccessible', kind: 'boolean' },
	{ param: 'habitatTypeId', as: 'habitatTypeIds', kind: 'uuidList' },
	{ param: 'tagId', as: 'tagIds', kind: 'uuidList' },
	REGION_FILTER,
	SEARCH_FILTER,
	// The Dashboard's banner links here; the surface reads the same fragment.
	{ param: 'untreated', as: 'untreatedOnly', kind: 'trueOnly' },
] as const satisfies MapFilterSpec;

export const ADDRESS_MAP_FILTERS = [SEARCH_FILTER, REGION_FILTER] as const satisfies MapFilterSpec;

export const REGION_MAP_FILTERS = [
	// A folder id, or the literal `unfiled` for folderless regions.
	{ param: 'regionFolderId', kind: 'text' },
	SEARCH_FILTER,
	// The regions explorer draws one checkbox-picked set rather than every region
	// its other filters allow, so its extent request names the ids outright. The
	// tiles stream every region and hide the rest client-side.
	{ param: 'id', as: 'ids', kind: 'uuidList' },
] as const satisfies MapFilterSpec;

export const INSPECTION_MAP_FILTERS = [
	{ param: 'isWet', kind: 'boolean' },
	{ param: 'density', as: 'densities', kind: 'density' },
	{ param: 'positive', as: 'positiveOnly', kind: 'boolean' },
	{ param: 'habitatTypeId', as: 'habitatTypeIds', kind: 'uuidList' },
	{ param: 'inspectedBy', as: 'inspectedByProfileIds', kind: 'uuidList' },
	REGION_FILTER,
	...DATE_FILTERS,
] as const satisfies MapFilterSpec;

export const SAMPLE_MAP_FILTERS = [
	{ param: 'species', as: 'speciesIds', kind: 'uuidList' },
	{ param: 'status', kind: 'sampleStatus' },
	{ param: 'nonMosquito', as: 'nonMosquitoOnly', kind: 'trueOnly' },
	REGION_FILTER,
	...DATE_FILTERS,
] as const satisfies MapFilterSpec;

export const CHEMICAL_MAP_FILTERS = [
	{ param: 'insecticideId', as: 'insecticideIds', kind: 'uuidList' },
	{ param: 'applicationMethodId', as: 'applicationMethodIds', kind: 'uuidList' },
	{ param: 'applicator', as: 'applicatorProfileIds', kind: 'uuidList' },
	REGION_FILTER,
	...DATE_FILTERS,
] as const satisfies MapFilterSpec;

export const SOURCE_REDUCTION_MAP_FILTERS = [
	{ param: 'sourceReductionMethodId', as: 'sourceReductionMethodIds', kind: 'uuidList' },
	TECHNICIAN_FILTER,
	REGION_FILTER,
	...DATE_FILTERS,
] as const satisfies MapFilterSpec;

export const BIOCONTROL_MAP_FILTERS = [
	{ param: 'biocontrolMethodId', as: 'biocontrolMethodIds', kind: 'uuidList' },
	{ param: 'habitatLinked', as: 'habitatLinkedOnly', kind: 'trueOnly' },
	TECHNICIAN_FILTER,
	REGION_FILTER,
	...DATE_FILTERS,
] as const satisfies MapFilterSpec;

export const OUTREACH_MAP_FILTERS = [
	{ param: 'outreachMethodId', as: 'outreachMethodIds', kind: 'uuidList' },
	TECHNICIAN_FILTER,
	REGION_FILTER,
	...DATE_FILTERS,
] as const satisfies MapFilterSpec;

export const TRAP_MAP_FILTERS = [
	{ param: 'collectionMethodId', as: 'collectionMethodIds', kind: 'uuidList' },
	{ param: 'status', as: 'isActive', kind: 'trapStatus' },
	SEARCH_FILTER,
	REGION_FILTER,
] as const satisfies MapFilterSpec;

export const COLLECTION_MAP_FILTERS = [
	{ param: 'collectionMethodId', as: 'collectionMethodIds', kind: 'uuidList' },
	{ param: 'problem', as: 'problemOnly', kind: 'trueOnly' },
	// The Dashboard's queue links here; the surface reads the same fragment.
	{ param: 'awaiting', as: 'awaitingOnly', kind: 'trueOnly' },
	REGION_FILTER,
	...DATE_FILTERS,
] as const satisfies MapFilterSpec;

/**
 * The service request filters the tiles, the extent and the list all apply.
 *
 * The date fields carry no default on the explorer: #920 decided a date
 * default there is not a substitute for the viewport. They exist so a count on
 * the period-in-review pages lands on the rows it counted.
 */
export const SERVICE_REQUEST_MAP_FILTERS = [
	{ param: 'status', as: 'isOpen', kind: 'requestStatus' },
	SEARCH_FILTER,
	{ param: 'tagId', as: 'tagIds', kind: 'uuidList' },
	// The Overdue filter: the first request date that is not overdue, which the
	// client computes from the Organization's threshold (#1246).
	{ param: 'overdueBefore', kind: 'date' },
	REGION_FILTER,
	...DATE_FILTERS,
] as const satisfies MapFilterSpec;

/**
 * The rail's order, which only the list request sends. The server admits it on
 * the tiles and the extent too and ignores it there, so the parser reads both
 * specs while the tile filter object carries the first alone.
 */
export const SERVICE_REQUEST_ORDER_FILTERS = [
	{ param: 'oldest', as: 'oldestFirst', kind: 'trueOnly' },
] as const satisfies MapFilterSpec;

/**
 * A filter object as wire params, for any spec.
 *
 * An absent value, an empty list and a blank string send nothing, so an empty
 * filter object encodes to no params at all. Lists are sorted, so picking the
 * same ids in another order leaves a tile URL, and the tile source behind it,
 * untouched. The result is a plain record because this package has no DOM
 * types; a caller wraps it in `URLSearchParams` where a URL needs one.
 */
export function encodeMapFilterParams<const TSpec extends MapFilterSpec>(
	spec: TSpec,
	filters: MapFiltersOf<TSpec>,
): Readonly<Record<string, string>> {
	const values = filters as Readonly<Record<string, unknown>>;
	const params: Record<string, string> = {};
	for (const field of spec) {
		const encoded = encodeField(field.kind, values[field.as ?? field.param]);
		if (encoded !== undefined) {
			params[field.param] = encoded;
		}
	}
	return params;
}

function joinSorted(list: readonly string[]): string | undefined {
	return list.length === 0 ? undefined : [...list].sort().join(',');
}

function trimmed(text: string): string | undefined {
	const value = text.trim();
	return value === '' ? undefined : value;
}

/** Each kind's wire form. `undefined` sends no param. */
const ENCODERS: {
	readonly [TKind in MapFilterKind]: (value: MapFilterKinds[TKind]) => string | undefined;
} = {
	boolean: String,
	trueOnly: (value) => (value ? 'true' : undefined),
	uuidList: joinSorted,
	density: joinSorted,
	text: trimmed,
	date: trimmed,
	sampleStatus: trimmed,
	trapStatus: (value) => (value ? 'active' : 'inactive'),
	requestStatus: (value) => (value ? 'open' : 'closed'),
};

function encodeField(kind: MapFilterKind, value: unknown): string | undefined {
	// The spec pairs the kind with the value's type, which a lookup by a
	// runtime kind cannot follow, so the encoder is read at its widest.
	const encode = ENCODERS[kind] as (value: unknown) => string | undefined;
	return value === undefined ? undefined : encode(value);
}
