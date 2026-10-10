import {
	encodeMapFilterParams,
	type MapFilterSpec,
	type MapFiltersOf,
	type OrganizationSettings,
} from '@simmer-mosquito/domain';
import type { LinkProps } from '@tanstack/react-router';
import type { RecordType } from '../../lib/record-nouns';
import type { FilterCodecs, FilterCounting, SearchCodec } from '../../lib/search-filters';
import type { MapTileLayer } from '../map/tile-layers';

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
 * The `/map/*` list endpoint both surfaces page through, where its rows arrive,
 * and where one record arrives when the Map reads it by id.
 */
export interface RecordSetEndpoint {
	/** The list endpoint, e.g. `/map/biocontrol`. */
	readonly path: `/map/${string}`;
	/** The key the rows arrive under in the response body, e.g. `biocontrolActions`. */
	readonly rowsKey: string;
	/**
	 * The key one record arrives under from `GET {path}/:id`, e.g.
	 * `biocontrolAction`. Only the Map reads it, for a selected record that is
	 * not on the page.
	 */
	readonly rowKey: string;
}

/**
 * A tileset a record set's Map can draw. Regions is not a record set, and its
 * layer also carries the ticked set.
 */
type RecordSetTileKind = Exclude<MapTileLayer['kind'], 'regions'>;

/** The filters the tileset `TKind` draws under. */
type TileFiltersOf<TKind extends RecordSetTileKind> = NonNullable<
	Extract<MapTileLayer, { readonly kind: TKind }>['filters']
>;

/**
 * A record set's tileset and the filters it draws under, paired by kind and
 * carrying nothing else. The explorer asserts a set's `tileset` and
 * `tileFilters` to this, because a generic `TTile` cannot be followed into the
 * `MapTileLayer` union, and the rest of the layer is checked by assignment.
 */
export type RecordSetTiles = {
	[TKind in RecordSetTileKind]: Pick<
		Extract<MapTileLayer, { readonly kind: TKind }>,
		'kind' | 'filters'
	>;
}[RecordSetTileKind];

/** True when `A` and `B` are one type, rather than each assignable to the other. */
type Same<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * The tilesets whose filter type is exactly `TTile`, which is what a record
 * set's `tileFilters` returns. Exact rather than assignable, because a tile
 * filter type is optional fields throughout and most would pass for another:
 * Outreach's and Source Reduction's differ by one field name.
 */
type RecordSetTileset<TTile> = {
	[TKind in RecordSetTileKind]: Same<TileFiltersOf<TKind>, TTile> extends true ? TKind : never;
}[RecordSetTileKind];

/**
 * One Map/Table pair over one record type and one filter contract.
 *
 * `TFilters` is inferred from `codecs` alone and `TTile` is the filters the
 * set's `filterSpec` declares, so everything else is checked against them
 * rather than widening them: a misspelled key, a missing key, an adapter
 * writing a key the spec does not hold and a tileset drawing other filters all
 * fail.
 */
export interface RecordSet<TFilters, TTile = unknown> extends RecordSetLinks<TFilters> {
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
	readonly endpoint: RecordSetEndpoint;
	/**
	 * The tileset the Map draws, one whose filter type is exactly `TTile`. The
	 * Table does not read it.
	 */
	readonly tileset: RecordSetTileset<TTile>;
	/**
	 * The filters as the tile layer reads them, with an unset filter absent.
	 * The Map draws its tiles from this and both surfaces build their list
	 * request from it, so the two cannot send different filters.
	 *
	 * Both conversions are properties rather than methods, because TypeScript
	 * checks a method's parameters bivariantly and a set over one tile type
	 * would then pass where a set over any tile is asked for (#1588).
	 */
	readonly tileFilters: (filters: TFilters, context: RecordSetContext) => TTile;
	/**
	 * The `/map/*` filter spec in `@simmer-mosquito/domain` that the server
	 * parses this set's requests with. The tile URL, the extent URL and the list
	 * request are all encoded from it, so no param name is written here.
	 */
	readonly filterSpec: MapFilterSpec;
}

/**
 * Declares a record set. An identity at runtime; what it adds is the
 * inference, so every other field is read against the keys `codecs` declares.
 */
export function defineRecordSet<TFilters, const TSpec extends MapFilterSpec>(
	definition: Omit<RecordSetLinks<TFilters>, 'applies'> & {
		readonly applies: { readonly [Key in keyof NoInfer<TFilters>]-?: AppliedOn };
		readonly defaults: (context: RecordSetContext, surface: RecordSetSurface) => NoInfer<TFilters>;
		readonly counting?:
			| FilterCounting<NoInfer<TFilters>>
			| ((context: RecordSetContext) => FilterCounting<NoInfer<TFilters>>);
		readonly textSearch?: TextSearch<NoInfer<TFilters>>;
		readonly endpoint: RecordSetEndpoint;
		readonly filterSpec: TSpec;
		readonly tileset: NoInfer<RecordSetTileset<MapFiltersOf<TSpec>>>;
		readonly tileFilters: (
			filters: NoInfer<TFilters>,
			context: RecordSetContext,
		) => NoInfer<MapFiltersOf<TSpec>>;
	},
): RecordSet<TFilters, MapFiltersOf<TSpec>> {
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

/**
 * The list request's filter params for `filters`: the tile filters as the list
 * endpoint reads them. The Map adds its viewport's `bbox` to these and the
 * Table adds the whole world's, so the two surfaces send one filter set under
 * two boxes.
 */
export function recordSetListParams<TFilters, TTile>(
	set: RecordSet<TFilters, TTile>,
	filters: TFilters,
	context: RecordSetContext,
): Readonly<Record<string, string>> {
	return recordSetFilterParams(set, set.tileFilters(filters, context));
}

/**
 * Tile filters as the wire params the set's spec encodes them to. An empty
 * object for no filters set, which is the rail's "none" empty reason.
 */
export function recordSetFilterParams(
	set: Pick<RecordSet<unknown>, 'filterSpec'>,
	tile: unknown,
): Readonly<Record<string, string>> {
	// `defineRecordSet` pairs the two, `TTile` being `MapFiltersOf` the spec; a
	// generic `TTile` cannot be followed back to the spec it came from here.
	return encodeMapFilterParams(set.filterSpec, tile as MapFiltersOf<MapFilterSpec>);
}

/** The set's counting rule in `context`, or none for a set that states none. */
export function recordSetCounting<TFilters>(
	set: Pick<RecordSet<TFilters>, 'counting'>,
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
