import { BIOCONTROL_MAP_FILTERS } from '@simmer-mosquito/domain';
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
import type { BiocontrolTileFilters } from '../../map';

// The biocontrol actions URL filter contract, outside the route modules so the
// Map and the Table read the same params. Every codec drops what it cannot
// read, so a malformed URL degrades to the defaults.

/** The filter state, keyed by the param each field appears under. */
export interface BiocontrolFilters {
	/** Inclusive start of the window on the biocontrol date (`YYYY-MM-DD`). */
	readonly from: string;
	/** Inclusive end of the window on the biocontrol date (`YYYY-MM-DD`). */
	readonly to: string;
	/** The technicians, by Profile id. */
	readonly people: ReadonlySet<string>;
	readonly methods: ReadonlySet<string>;
	/** Only biocontrol actions linked to a Habitat. */
	readonly habitat: boolean;
	readonly regions: ReadonlySet<string>;
}

export const biocontrolFilterCodecs: FilterCodecs<BiocontrolFilters> = {
	from: dateParam,
	to: dateParam,
	people: idSetParam,
	methods: idSetParam,
	habitat: flagParam,
	regions: idSetParam,
};

/**
 * What an address with no filter params means: every biocontrol action inside `window`, the
 * bounds the set's `windows` open the surface on.
 */
export function biocontrolFilterDefaults(window: RecordSetWindowBounds): BiocontrolFilters {
	return {
		from: window.from,
		to: window.to,
		people: new Set(),
		methods: new Set(),
		habitat: false,
		regions: new Set(),
	};
}

/** The filters as the biocontrol tile layer reads them. An unset filter is absent. */
export function biocontrolTileFilters(filters: BiocontrolFilters): BiocontrolTileFilters {
	return {
		...whenAny('biocontrolMethodIds', filters.methods),
		...whenAny('technicianProfileIds', filters.people),
		...whenOn('habitatLinkedOnly', filters.habitat),
		...whenAny('regionIds', filters.regions),
		...whenText('dateFrom', filters.from),
		...whenText('dateTo', filters.to),
	};
}

/**
 * The Biocontrol Actions Map and Table. Both read `/map/biocontrol` and apply every filter.
 */
export const biocontrolRecordSet = defineRecordSet({
	recordType: 'biocontrolAction',
	paths: { map: '/control-operations/biocontrol', table: '/control-operations/biocontrol/table' },
	codecs: biocontrolFilterCodecs,
	endpoint: { path: '/map/biocontrol', rowsKey: 'biocontrolActions', rowKey: 'biocontrolAction' },
	tileset: 'biocontrol',
	tileFilters: biocontrolTileFilters,
	filterSpec: BIOCONTROL_MAP_FILTERS,
	defaults: ({ window }) => biocontrolFilterDefaults(window),
	windows: {
		map: { kind: 'lastDays', days: 90, reason: 'Ninety days is one season of biocontrol actions.' },
		table: TABLE_OPENS_ON_ALL_TIME,
	},
	counting: DATE_RANGE_COUNTING,
	applies: {
		from: 'both',
		to: 'both',
		people: 'both',
		methods: 'both',
		habitat: 'both',
		regions: 'both',
	},
});
