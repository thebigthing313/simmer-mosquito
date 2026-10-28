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
	recordSetExportRequest,
	recordSetInert,
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
import { recordEmptyTitle } from '../../../../components/record/record-empty-title';
import { addDaysToDateString } from '../../../../lib/local-date';
import { mapQueryParams } from '../../../../lib/map-query-params';
import { recordNoun } from '../../../../lib/record-nouns';
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

/**
 * The window each dated set opens on, written out here rather than read off
 * the register, so a register that moves a window fails this suite (#1669).
 * Every Table opens on all time; the Maps keep a window because a Map draws
 * every matching record at once.
 */
const DATED: readonly (readonly [string, RecordSet<Record<string, unknown>>, string, string])[] = [
	['inspections', inspectionRecordSet as never, '2026-09-10', 'No Inspections in the Last 30 Days'],
	['samples', sampleRecordSet as never, '2026-09-10', 'No Samples in the Last 30 Days'],
	['collections', collectionRecordSet as never, '2026-07-12', 'No Collections in the Last 90 Days'],
	[
		'chemical applications',
		applicationRecordSet as never,
		'2026-07-12',
		'No Chemical Applications in the Last 90 Days',
	],
	[
		'biocontrol actions',
		biocontrolRecordSet as never,
		'2026-07-12',
		'No Biocontrol Actions in the Last 90 Days',
	],
	[
		'source reductions',
		sourceReductionRecordSet as never,
		'2026-07-12',
		'No Source Reductions in the Last 90 Days',
	],
	[
		'outreach actions',
		outreachRecordSet as never,
		'2026-07-12',
		'No Outreach Actions in the Last 90 Days',
	],
	[
		'service requests',
		serviceRequestRecordSet as never,
		'2026-01-01',
		'No Service Requests This Year',
	],
];

describe.each(DATED)('the %s opening windows', (_name, set, mapFrom, mapTitle) => {
	const context = contextOn('2026-10-09', 'off');

	it('opens the Table on all time, and sends no date bound for it', () => {
		const defaults = set.defaults(context, 'table');

		expect(defaults).toMatchObject({ from: '', to: '' });
		const params = recordSetListParams(set, defaults, context);
		expect(params).not.toHaveProperty('dateFrom');
		expect(params).not.toHaveProperty('dateTo');
	});

	it('opens the Map on its window, today included', () => {
		expect(set.defaults(context, 'map')).toMatchObject({ from: mapFrom, to: context.today });
	});

	it('titles an empty Table and an empty Map with the window each opens on', () => {
		expect(recordEmptyTitle(set.recordType, set.emptyScope('table'))).toBe(
			`No ${recordNoun(set.recordType).titleMany} Yet`,
		);
		expect(recordEmptyTitle(set.recordType, set.emptyScope('map'))).toBe(mapTitle);
	});

	it('gives each window a reason of one sentence', () => {
		for (const surface of ['map', 'table'] as const) {
			expect(set.windows?.[surface].reason).toMatch(/^[A-Z][^.]*\.$/);
		}
	});

	it('carries to the Table the dates a reader set on the Map, and not the Map window', () => {
		const validate = searchValidator(surfaceCodecs(set, 'map'));

		expect(carriedSearch(set, validate({}), 'table')).toEqual({});
		expect(carriedSearch(set, validate({ from: '2026-08-01', to: '2026-08-31' }), 'table')).toEqual(
			{ from: '2026-08-01', to: '2026-08-31' },
		);
	});
});

describe.each([
	['habitats', habitatRecordSet],
	['traps', trapRecordSet],
	['addresses', addressRecordSet],
] as const)('the undated %s set', (_name, set) => {
	it('declares no date window', () => {
		expect(set.windows).toBeUndefined();
	});
});

/*
 * Both surfaces' empty states name the set's scope when nothing is set, so a
 * scope that drifts from the defaults would title an empty Map or Table with a
 * window the request never used (#1653).
 */
describe.each(SETS)('the %s empty scope', (_name, links) => {
	const set = links as RecordSet<Record<string, unknown>>;
	const context = contextOn('2026-10-09', 'off');

	it.each(['map', 'table'] as const)('names the window the %s opens on', (surface) => {
		const scope = set.emptyScope(surface);
		const defaults = set.defaults(context, surface);
		switch (scope.kind) {
			case 'lastDays':
				expect(defaults).toMatchObject({
					from: addDaysToDateString(context.today, -(scope.days - 1)),
					to: context.today,
				});
				break;
			case 'thisYear':
				expect(defaults).toMatchObject({ from: '2026-01-01', to: context.today });
				break;
			default:
				// A scope with no window opens on no dates.
				expect(defaults.from ?? '').toBe('');
				expect(defaults.to ?? '').toBe('');
		}
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

	it('calls Overdue inert only while the threshold is off', () => {
		expect([...recordSetInert(serviceRequestRecordSet, contextOn('2026-10-09', 'off'))]).toEqual([
			'overdue',
		]);
		expect(recordSetInert(serviceRequestRecordSet, contextOn('2026-10-09', 14)).size).toBe(0);
	});
});

describe('an inert filter in the counting', () => {
	const context = contextOn('2026-10-09', 14);

	it("is left uncounted beside the set's own uncounted keys and groups", () => {
		const counting = recordSetCounting<{ a: string; b: string; c: string }>(
			{ counting: { groups: [['a', 'b']], uncounted: ['a'] }, inert: () => ['c'] },
			context,
		);

		expect(counting).toEqual({ groups: [['a', 'b']], uncounted: ['a', 'c'] });
	});

	it("leaves a set's counting as it is when nothing is inert", () => {
		const own = { groups: [['a', 'b']] } as const;

		expect(recordSetCounting({ counting: own, inert: () => [] }, context)).toBe(own);
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

describe('the export request', () => {
	const params = { bbox: '-180,-90,180,90', density: 'heavy' };

	it('reads the page request unpaged where the set declares an export', () => {
		expect(recordSetExportRequest(inspectionRecordSet, params, '2026-10-28')).toEqual({
			path: '/map/inspections',
			params,
			recordType: 'inspection',
			today: '2026-10-28',
		});
	});

	it('waits on a Map with no viewport yet', () => {
		expect(recordSetExportRequest(inspectionRecordSet, null, '2026-10-28')).toBeNull();
	});

	it('is absent for a set whose endpoint declares no export', () => {
		const { path, rowsKey, rowKey } = biocontrolRecordSet.endpoint;
		const endpoint = { path, rowsKey, rowKey };
		expect(
			recordSetExportRequest({ ...biocontrolRecordSet, endpoint }, params, '2026-10-28'),
		).toBeUndefined();
	});

	it.each([
		habitatRecordSet,
		inspectionRecordSet,
		sampleRecordSet,
		trapRecordSet,
		collectionRecordSet,
		applicationRecordSet,
		biocontrolRecordSet,
		sourceReductionRecordSet,
		outreachRecordSet,
		serviceRequestRecordSet,
		addressRecordSet,
	] as readonly RecordSet<unknown, unknown>[])('is read for $endpoint.path', (set) => {
		expect(recordSetExportRequest(set, params, '2026-10-28')?.path).toBe(set.endpoint.path);
	});
});
