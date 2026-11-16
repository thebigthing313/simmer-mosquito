/** @vitest-environment jsdom */

/**
 * useInsecticideUsage over the window's Treatments and their lines.
 *
 * The product is the thing counted here, so the roll-up is over lines: a
 * Treatment that put out two products adds one Chemical Application to each
 * (ADR 0020). `unresolved-performed-actions.ts` says why a name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useInsecticideUsage } from '../../../../hooks/queries/use-insecticide-usage';
import { applications } from '../../../../lib/collections/applications';
import { insecticides } from '../../../../lib/collections/insecticides';
import { treatments } from '../../../../lib/collections/treatments';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { readList } from './read-harness';
import { DAY, GONE_PRODUCT, seedUnresolvedActions } from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
});

async function readUsage(since = DAY) {
	return readList(() => {
		const read = useInsecticideUsage(since);
		return { isReady: read.isReady, rows: read.usage };
	});
}

describe('useInsecticideUsage', () => {
	it('reads the insecticide name as null when the product is not in the client', async () => {
		seedUnresolvedActions();

		const rows = await readUsage();

		expect(rows).toEqual([
			expect.objectContaining({ insecticideId: GONE_PRODUCT, name: null, applicationCount: 1 }),
		]);
	});

	it('counts a two-product Treatment once under each product, and sums each in its unit', async () => {
		seedRows(insecticides, [
			{ id: 'bti', trade_name: 'VectoBac 12AS' },
			{ id: 'mets', trade_name: 'Altosid' },
		]);
		seedRows(treatments, [
			{ id: 't-basins', application_date: DAY },
			{ id: 't-ditch', application_date: DAY },
			// Before the window: its line is not read.
			{ id: 't-old', application_date: '2026-07-01' },
		]);
		seedRows(applications, [
			{
				id: 'l1',
				treatment_id: 't-basins',
				insecticide_id: 'bti',
				amount_applied: 2,
				application_unit_id: 'gal',
			},
			{
				id: 'l2',
				treatment_id: 't-basins',
				insecticide_id: 'mets',
				amount_applied: 10,
				application_unit_id: 'oz',
			},
			{
				id: 'l3',
				treatment_id: 't-ditch',
				insecticide_id: 'bti',
				amount_applied: 3,
				application_unit_id: 'gal',
			},
			{
				id: 'l4',
				treatment_id: 't-old',
				insecticide_id: 'bti',
				amount_applied: 50,
				application_unit_id: 'gal',
			},
		]);

		const rows = await readUsage();
		const byId = new Map(rows.map((row) => [row.insecticideId, row]));

		expect(rows).toHaveLength(2);
		expect(byId.get('bti')?.applicationCount).toBe(2);
		expect(byId.get('bti')?.totalsByUnitId).toEqual(new Map([['gal', 5]]));
		expect(byId.get('mets')?.applicationCount).toBe(1);
		expect(byId.get('mets')?.totalsByUnitId).toEqual(new Map([['oz', 10]]));
		// Two Treatments, three per-product counts: the two-product job is in both.
		expect(rows.reduce((total, row) => total + row.applicationCount, 0)).toBe(3);
	});
});
