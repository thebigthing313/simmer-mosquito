import { COLLECTION_MAP_FILTERS } from '@simmer-mosquito/domain';
import {
	DATE_RANGE_COUNTING,
	dateParam,
	type FilterCodecs,
	flagParam,
	idSetParam,
} from '../../../lib/search-filters';
import {
	defineRecordSet,
	type RecordSetWindowBounds,
	TABLE_OPENS_ON_ALL_TIME,
} from '../../explorer/record-set';
import { whenAny, whenOn, whenText } from '../../explorer/tile-filter-params';
import type { CollectionTileFilters } from '../../map';

// The collections URL filter contract, outside the route modules so the Map and
// the Table read the same params. Every codec drops what it cannot read, so a
// malformed URL degrades to the defaults.

/** The filter state, keyed by the param each field appears under. */
export interface CollectionFilters {
	/** Inclusive start of the window on the collection's own date (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the window on the collection's own date (`YYYY-MM-DD`). */
	readonly to: string;
	readonly methods: ReadonlySet<string>;
	readonly problems: boolean;
	/** Awaiting identification: dated, not a zero result, no species keyed out. */
	readonly awaiting: boolean;
	readonly regions: ReadonlySet<string>;
}

export const collectionFilterCodecs: FilterCodecs<CollectionFilters> = {
	from: dateParam,
	to: dateParam,
	methods: idSetParam,
	problems: flagParam,
	awaiting: flagParam,
	regions: idSetParam,
};

/**
 * What an address with no filter params means: every collection inside `window`, the
 * bounds the set's `windows` open the surface on.
 */
export function collectionFilterDefaults(window: RecordSetWindowBounds): CollectionFilters {
	return {
		from: window.from,
		to: window.to,
		methods: new Set(),
		problems: false,
		awaiting: false,
		regions: new Set(),
	};
}

/** The filters as the collections tile layer reads them. An unset filter is absent. */
export function collectionTileFilters(filters: CollectionFilters): CollectionTileFilters {
	return {
		...whenAny('collectionMethodIds', filters.methods),
		...whenOn('problemOnly', filters.problems),
		...whenOn('awaitingOnly', filters.awaiting),
		...whenAny('regionIds', filters.regions),
		...whenText('dateFrom', filters.from),
		...whenText('dateTo', filters.to),
	};
}

/**
 * The Collections Map and Table. Both read `/map/collections` and apply every filter.
 */
export const collectionRecordSet = defineRecordSet({
	recordType: 'collection',
	paths: { map: '/adult-surveillance/collections', table: '/adult-surveillance/collections/table' },
	codecs: collectionFilterCodecs,
	endpoint: {
		path: '/map/collections',
		rowsKey: 'collections',
		rowKey: 'collection',
		exports: true,
	},
	tileset: 'collections',
	tileFilters: collectionTileFilters,
	filterSpec: COLLECTION_MAP_FILTERS,
	defaults: ({ window }) => collectionFilterDefaults(window),
	windows: {
		map: { kind: 'lastDays', days: 90, reason: 'Ninety days is one season of collections.' },
		table: TABLE_OPENS_ON_ALL_TIME,
	},
	counting: DATE_RANGE_COUNTING,
	applies: {
		from: 'both',
		to: 'both',
		methods: 'both',
		problems: 'both',
		awaiting: 'both',
		regions: 'both',
	},
});
