import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import { collectionRecordSet } from '../../../../components/adult-surveillance/collections/collections-search';
import { trapRecordSet } from '../../../../components/adult-surveillance/traps/traps-search';
import { biocontrolRecordSet } from '../../../../components/control-operations/biocontrol/biocontrol-actions-search';
import { applicationRecordSet } from '../../../../components/control-operations/chemical/applications-search';
import { sourceReductionRecordSet } from '../../../../components/control-operations/source-reduction/source-reductions-search';
import {
	carriedSearch,
	defineRecordSet,
	type RecordSet,
	type RecordSetContext,
	type RecordSetLinks,
	type RecordSetSurface,
	recordSetCounting,
	recordSetListParams,
	surfaceCodecs,
} from '../../../../components/explorer/record-set';
import {
	type AddressFilters,
	addressRecordSet,
} from '../../../../components/gis/addresses/addresses-search';
import { habitatRecordSet } from '../../../../components/larval-surveillance/habitats/habitats-search';
import { inspectionRecordSet } from '../../../../components/larval-surveillance/inspections-search';
import { sampleRecordSet } from '../../../../components/larval-surveillance/samples-search';
import { outreachRecordSet } from '../../../../components/public-engagement/outreach/outreach-actions-search';
import { serviceRequestRecordSet } from '../../../../components/public-engagement/service-requests/service-requests-search';
import { mapQueryParams } from '../../../../lib/map-query-params';
import {
	countActiveFilters,
	resolveFilters,
	searchValidator,
} from '../../../../lib/search-filters';

/**
 * Every Map/Table pair, with the filter keys its Table does not apply spelled
 * out here rather than read off the definition, so a definition that starts
 * carrying one of them fails this suite instead of agreeing with itself.
 */
const SETS: readonly (readonly [string, RecordSetLinks<unknown>, readonly string[]])[] = [
	['habitats', habitatRecordSet, []],
	['inspections', inspectionRecordSet, ['regions']],
	['samples', sampleRecordSet, []],
	['traps', trapRecordSet, []],
	['collections', collectionRecordSet, []],
	['chemical applications', applicationRecordSet, []],
	['biocontrol actions', biocontrolRecordSet, []],
	['source reductions', sourceReductionRecordSet, []],
	['outreach actions', outreachRecordSet, []],
	['service requests', serviceRequestRecordSet, ['search', 'tags', 'regions']],
	['addresses', addressRecordSet, []],
];

/** A search holding every filter key and two params that are not filters. */
function everyParam(set: RecordSetLinks<unknown>): Record<string, unknown> {
	const search: Record<string, unknown> = { page: 3, order: 'oldest' };
	for (const key of Object.keys(set.codecs as object)) {
		search[key] = `${key}-value`;
	}
	return search;
}

function keysAppliedOn(set: RecordSetLinks<unknown>, surface: RecordSetSurface): string[] {
	return Object.entries(set.applies as Record<string, string>)
		.filter(([, appliedOn]) => appliedOn === 'both' || appliedOn === surface)
		.map(([key]) => key)
		.sort();
}

describe.each(SETS)('the %s record set', (_name, set, tableDrops) => {
	const filterKeys = Object.keys(set.codecs as object).sort();

	it('names every filter key in `applies`', () => {
		expect(Object.keys(set.applies as object).sort()).toEqual(filterKeys);
	});

	it('applies every filter on the Map, and on the Table all but the ones it drops', () => {
		expect(keysAppliedOn(set, 'map')).toEqual(filterKeys);
		expect(keysAppliedOn(set, 'table')).toEqual(
			filterKeys.filter((key) => !tableDrops.includes(key)),
		);
	});

	it.each([
		'map',
		'table',
	] as const)('carries exactly the keys the %s applies, and no param that is not a filter', (target) => {
		const carried = carriedSearch(set, everyParam(set), target);

		expect(Object.keys(carried).sort()).toEqual(keysAppliedOn(set, target));
		for (const [key, value] of Object.entries(carried)) {
			expect(value).toBe(`${key}-value`);
		}
	});

	it('loses on a Map to Table to Map round trip only the keys the Table does not apply', () => {
		const onTable = carriedSearch(set, everyParam(set), 'table');
		const backOnMap = carriedSearch(set, onTable, 'map');

		expect(Object.keys(backOnMap).sort()).toEqual(keysAppliedOn(set, 'table'));
		for (const key of tableDrops) {
			expect(backOnMap).not.toHaveProperty(key);
		}
	});

	it.each([
		'map',
		'table',
	] as const)('reads on the %s exactly the keys it applies, and nothing for the rest', (surface) => {
		const codecs = surfaceCodecs(set, surface) as Record<
			string,
			{ readonly decode: (raw: unknown) => unknown }
		>;
		const own = set.codecs as Record<string, unknown>;
		const applied = keysAppliedOn(set, surface);

		for (const key of filterKeys) {
			if (applied.includes(key)) {
				expect(codecs[key]).toBe(own[key]);
			} else {
				expect(codecs[key]?.decode(['anything'])).toBeUndefined();
			}
		}
	});

	it('carries nothing for a filter left at its default', () => {
		const search = everyParam(set);
		for (const key of filterKeys) {
			delete search[key];
		}

		expect(carriedSearch(set, search, 'table')).toEqual({});
		expect(carriedSearch(set, search, 'map')).toEqual({});
	});
});

describe('switching Inspections from the Map to the Table', () => {
	it('leaves no regions on the Table address', () => {
		const carried = carriedSearch(
			inspectionRecordSet,
			{ from: '2026-08-01', to: '2026-08-31', regions: ['region-1'] },
			'table',
		);

		expect(carried).toEqual({ from: '2026-08-01', to: '2026-08-31' });
	});
});

/** What a set's defaults read, on `today` with the overdue threshold as given. */
function contextOn(today: string, serviceRequestOverdueDays: number | 'off'): RecordSetContext {
	const { settings } = resolveOrganizationSettings({
		publicEngagement: { serviceRequestOverdueDays },
	});
	return { today, settings };
}

describe('the Inspections opening window', () => {
	const context = contextOn('2026-10-09', 'off');

	it('opens the Map on the last 30 days, today included', () => {
		expect(inspectionRecordSet.defaults(context, 'map')).toMatchObject({
			from: '2026-09-10',
			to: '2026-10-09',
		});
	});

	it('opens the Table on all time', () => {
		expect(inspectionRecordSet.defaults(context, 'table')).toMatchObject({ from: '', to: '' });
	});
});

describe('the Inspections Table address', () => {
	it('drops a Region a hand-typed address carries and keeps the rest', () => {
		const validate = searchValidator(surfaceCodecs(inspectionRecordSet, 'table'));

		expect(validate({ from: '2026-08-01', water: 'wet', regions: ['region-1'] })).toEqual({
			from: '2026-08-01',
			water: 'wet',
		});
	});
});

describe('the service requests count', () => {
	function countWithOverdue(serviceRequestOverdueDays: number | 'off'): number {
		const context = contextOn('2026-10-09', serviceRequestOverdueDays);
		const defaults = serviceRequestRecordSet.defaults(context, 'map');
		return countActiveFilters(
			defaults,
			{ ...defaults, overdue: true },
			recordSetCounting(serviceRequestRecordSet, context),
		);
	}

	it('counts Overdue while the Organization has a threshold', () => {
		expect(countWithOverdue(14)).toBe(1);
	});

	it('does not count an Overdue left on the address while the threshold is off', () => {
		expect(countWithOverdue('off')).toBe(0);
	});
});

describe('a record set definition', () => {
	it('refuses a path that is not in the route tree', () => {
		const set = defineRecordSet({
			recordType: 'address',
			// @ts-expect-error: no route is mounted at this path.
			paths: { map: '/gis/addresses', table: '/gis/adresses/table' },
			codecs: addressRecordSet.codecs,
			defaults: addressRecordSet.defaults,
			applies: { search: 'both', regions: 'both' },
		});

		expect(set.paths.table).toBe('/gis/adresses/table');
	});

	it('refuses an `applies` map whose keys are not the filter keys', () => {
		const set = defineRecordSet({
			recordType: 'address',
			paths: addressRecordSet.paths,
			codecs: addressRecordSet.codecs,
			defaults: addressRecordSet.defaults,
			// @ts-expect-error: `region` is not one of the filter keys.
			applies: { search: 'both', region: 'both' },
		});

		expect(Object.keys(set.applies)).toEqual(['search', 'region']);
	});

	it('refuses a search box over a key that is not a text filter', () => {
		const set = defineRecordSet({
			recordType: 'address',
			paths: addressRecordSet.paths,
			codecs: addressRecordSet.codecs,
			defaults: addressRecordSet.defaults,
			applies: { search: 'both', regions: 'both' },
			// @ts-expect-error: `regions` is a selection, not a text filter.
			textSearch: { key: 'regions' },
		});

		expect(set.textSearch?.key).toBe('regions');
	});

	it("refuses a tileset whose filters are not the set's", () => {
		// Habitats' filters are not the address set's.
		const habitatsOverAddresses = defineRecordSet({
			...addressRecordSet,
			// @ts-expect-error: the habitats tileset does not draw address filters.
			tileset: 'habitats',
		});
		// Source Reduction's filters differ from Outreach's by one field name, so
		// each type would pass for the other, which is why the check is exact
		// rather than by assignment.
		const sourceReductionOverOutreach = defineRecordSet({
			...outreachRecordSet,
			// @ts-expect-error: the source reduction tileset does not draw outreach filters.
			tileset: 'source-reduction',
		});

		expect(habitatsOverAddresses.tileset).toBe('habitats');
		expect(sourceReductionOverOutreach.tileset).toBe('source-reduction');
	});

	it('does not widen to a set over any tile', () => {
		// @ts-expect-error: the set's `tileset` draws address tile filters, so it cannot draw any value.
		const widened: RecordSet<AddressFilters, unknown> = addressRecordSet;

		expect(widened).toBe(addressRecordSet);
	});
});

/**
 * A search setting every filter key of a set off its default, as an address
 * spells it. The dates are named, so the Inspections Map's 30 days and its
 * Table's all time open on the same window here.
 */
const FULL_SEARCH: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
	habitats: {
		search: 'pond',
		status: 'inactive',
		access: 'inaccessible',
		typeIds: ['type-1'],
		tagIds: ['tag-1'],
		regions: ['region-1'],
		untreated: true,
	},
	inspections: {
		from: '2026-08-01',
		to: '2026-08-31',
		water: 'wet',
		density: ['heavy'],
		positive: true,
		types: ['type-1'],
		inspectors: ['person-1'],
		regions: ['region-1'],
	},
	samples: {
		from: '2026-08-01',
		to: '2026-08-31',
		status: 'awaiting',
		species: ['species-1'],
		nonMosquito: true,
		regions: ['region-1'],
	},
	traps: { search: 'T-12', status: 'inactive', methods: ['method-1'], regions: ['region-1'] },
	collections: {
		from: '2026-08-01',
		to: '2026-08-31',
		methods: ['method-1'],
		problems: true,
		awaiting: true,
		regions: ['region-1'],
	},
	'chemical applications': {
		from: '2026-08-01',
		to: '2026-08-31',
		insecticides: ['insecticide-1'],
		people: ['person-1'],
		methods: ['method-1'],
		regions: ['region-1'],
	},
	'biocontrol actions': {
		from: '2026-08-01',
		to: '2026-08-31',
		people: ['person-1'],
		methods: ['method-1'],
		habitat: true,
		regions: ['region-1'],
	},
	'source reductions': {
		from: '2026-08-01',
		to: '2026-08-31',
		people: ['person-1'],
		methods: ['method-1'],
		regions: ['region-1'],
	},
	'outreach actions': {
		from: '2026-08-01',
		to: '2026-08-31',
		people: ['person-1'],
		methods: ['method-1'],
		regions: ['region-1'],
	},
	'service requests': {
		status: 'open',
		search: 'bees',
		tags: ['tag-1'],
		regions: ['region-1'],
		from: '2026-08-01',
		to: '2026-08-31',
		overdue: true,
	},
	addresses: { search: 'Main', regions: ['region-1'] },
};

/** What a surface sends for one search, and for the same search with one key at its default. */
interface SurfaceRequest {
	readonly params: Readonly<Record<string, string>>;
	readonly paramsWithout: (key: string) => Readonly<Record<string, string>>;
}

/**
 * The page request `surface` sends for `search`: the search validated as the
 * surface reads it, resolved over the surface's defaults, and put through the
 * set's own conversion.
 */
function requestOn<TFilters extends object, TTile>(
	set: RecordSet<TFilters, TTile>,
	surface: RecordSetSurface,
	search: Record<string, unknown>,
	context: RecordSetContext,
): SurfaceRequest {
	const codecs = surfaceCodecs(set, surface);
	const defaults = set.defaults(context, surface);
	const filters = resolveFilters(defaults, codecs, searchValidator(codecs)(search));
	const send = (from: TFilters) => mapQueryParams(recordSetListParams(set, from, context));
	return {
		params: send(filters),
		paramsWithout: (key) => send({ ...filters, [key]: defaults[key as keyof TFilters] }),
	};
}

/**
 * The two requests one search makes: the Map's, from the address as given,
 * and the Table's, from what the switch carries there.
 */
function requestsFor<TFilters extends object, TTile>(set: RecordSet<TFilters, TTile>) {
	return (search: Record<string, unknown>, context: RecordSetContext) => {
		const onMap = searchValidator(surfaceCodecs(set, 'map'))(search);
		return {
			map: requestOn(set, 'map', onMap, context),
			table: requestOn(set, 'table', carriedSearch(set, onMap, 'table'), context),
		};
	};
}

const REQUESTS = [
	['habitats', habitatRecordSet, requestsFor(habitatRecordSet)],
	['inspections', inspectionRecordSet, requestsFor(inspectionRecordSet)],
	['samples', sampleRecordSet, requestsFor(sampleRecordSet)],
	['traps', trapRecordSet, requestsFor(trapRecordSet)],
	['collections', collectionRecordSet, requestsFor(collectionRecordSet)],
	['chemical applications', applicationRecordSet, requestsFor(applicationRecordSet)],
	['biocontrol actions', biocontrolRecordSet, requestsFor(biocontrolRecordSet)],
	['source reductions', sourceReductionRecordSet, requestsFor(sourceReductionRecordSet)],
	['outreach actions', outreachRecordSet, requestsFor(outreachRecordSet)],
	['service requests', serviceRequestRecordSet, requestsFor(serviceRequestRecordSet)],
	['addresses', addressRecordSet, requestsFor(addressRecordSet)],
] as const;

describe.each(REQUESTS)('the %s list request', (name, set, requests) => {
	// Overdue narrows only while the Organization has a threshold.
	const context = contextOn('2026-10-09', 14);
	const search = FULL_SEARCH[name] ?? {};
	const filterKeys = Object.keys(set.codecs as object).sort();
	const tableKeys = keysAppliedOn(set, 'table');
	const dropped = filterKeys.filter((key) => !tableKeys.includes(key));

	it('starts from a search setting every filter key off its default', () => {
		expect(Object.keys(search).sort()).toEqual(filterKeys);
		const validate = searchValidator(set.codecs as Parameters<typeof searchValidator>[0]);
		expect(validate(search)).toEqual(search);
	});

	it('sends a param for every key the Table applies, from both surfaces', () => {
		const { map, table } = requests(search, context);
		for (const key of tableKeys) {
			expect(map.paramsWithout(key), `${key} on the Map`).not.toEqual(map.params);
			expect(table.paramsWithout(key), `${key} on the Table`).not.toEqual(table.params);
		}
	});

	it('sends the same params from the Map and the Table for every key the Table applies', () => {
		const withoutDropped = Object.fromEntries(
			Object.entries(search).filter(([key]) => !dropped.includes(key)),
		);

		expect(requests(search, context).table.params).toEqual(
			requests(withoutDropped, context).map.params,
		);
	});
});

describe.each(
	REQUESTS.filter(
		([, set]) => keysAppliedOn(set, 'table').length < keysAppliedOn(set, 'map').length,
	),
)('the %s list request, for a key the Table drops', (name, set, requests) => {
	it('sends it from the Map and not from the Table', () => {
		const context = contextOn('2026-10-09', 14);
		const { map, table } = requests(FULL_SEARCH[name] ?? {}, context);
		const tableKeys = keysAppliedOn(set, 'table');

		expect(table.params).not.toEqual(map.params);
		for (const key of keysAppliedOn(set, 'map').filter((each) => !tableKeys.includes(each))) {
			expect(map.paramsWithout(key), key).not.toEqual(map.params);
			expect(table.paramsWithout(key), key).toEqual(table.params);
		}
	});
});
