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
	type RecordSetSurface,
} from '../../../../components/explorer/record-set';
import { addressRecordSet } from '../../../../components/gis/addresses/addresses-search';
import { habitatRecordSet } from '../../../../components/larval-surveillance/habitats/habitats-search';
import { inspectionRecordSet } from '../../../../components/larval-surveillance/inspections-search';
import { sampleRecordSet } from '../../../../components/larval-surveillance/samples-search';
import { outreachRecordSet } from '../../../../components/public-engagement/outreach/outreach-actions-search';
import { serviceRequestRecordSet } from '../../../../components/public-engagement/service-requests/service-requests-search';

/**
 * Every Map/Table pair, with the filter keys its Table does not apply spelled
 * out here rather than read off the definition, so a definition that starts
 * carrying one of them fails this suite instead of agreeing with itself.
 */
const SETS: readonly (readonly [string, RecordSet<unknown>, readonly string[]])[] = [
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
function everyParam(set: RecordSet<unknown>): Record<string, unknown> {
	const search: Record<string, unknown> = { page: 3, order: 'oldest' };
	for (const key of Object.keys(set.codecs as object)) {
		search[key] = `${key}-value`;
	}
	return search;
}

function keysAppliedOn(set: RecordSet<unknown>, surface: RecordSetSurface): string[] {
	return Object.entries(set.applies as Record<string, string>)
		.filter(([, treatment]) => treatment === 'both' || treatment === surface)
		.map(([key]) => key)
		.sort();
}

describe.each(SETS)('the %s record set', (_name, set, tableDrops) => {
	const filterKeys = Object.keys(set.codecs as object).sort();

	it('names every filter key in its treatment map', () => {
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

describe('a record set definition', () => {
	it('refuses a path that is not in the route tree', () => {
		const set = defineRecordSet({
			recordType: 'address',
			// @ts-expect-error: no route is mounted at this path.
			paths: { map: '/gis/addresses', table: '/gis/adresses/table' },
			codecs: addressRecordSet.codecs,
			applies: { search: 'both', regions: 'both' },
		});

		expect(set.paths.table).toBe('/gis/adresses/table');
	});

	it('refuses a treatment map whose keys are not the filter keys', () => {
		const set = defineRecordSet({
			recordType: 'address',
			paths: addressRecordSet.paths,
			codecs: addressRecordSet.codecs,
			// @ts-expect-error: `region` is not one of the filter keys.
			applies: { search: 'both', region: 'both' },
		});

		expect(Object.keys(set.applies)).toEqual(['search', 'region']);
	});
});
