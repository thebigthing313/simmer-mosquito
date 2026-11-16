/** @vitest-environment jsdom */

/**
 * useControlActionsForDay over a day of control actions whose subject, method and performer the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 *
 * The chemical kind is the Treatment, so the panel's per-person count and kind
 * breakdown count a visit once however many products it held, and the
 * products ride on the action as lines (ADR 0020).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useControlActionsForDay } from '../../../../hooks/queries/use-control-actions-for-day';
import { applications } from '../../../../lib/collections/applications';
import { insecticides } from '../../../../lib/collections/insecticides';
import { treatments } from '../../../../lib/collections/treatments';
import { units } from '../../../../lib/collections/units';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { readList } from './read-harness';
import {
	DAY,
	GONE_METHOD,
	GONE_PRODUCT,
	GONE_PROFILE,
	seedUnresolvedActions,
} from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
});

async function readDay() {
	return readList(() => {
		const read = useControlActionsForDay(DAY);
		return { isReady: read.isReady, rows: read.actions };
	});
}

describe('useControlActionsForDay', () => {
	it('reads every subject, method and performer name as null when none is in the client', async () => {
		seedUnresolvedActions();

		const rows = await readDay();

		expect(rows).toHaveLength(3);
		expect(rows.find((row) => row.kind === 'application')).toMatchObject({
			performedByProfileId: GONE_PROFILE,
			performedByName: null,
			subjectName: null,
			methodId: GONE_METHOD,
			methodName: null,
			lines: [expect.objectContaining({ insecticideId: GONE_PRODUCT, insecticideName: null })],
		});
		for (const kind of ['sourceReduction', 'biocontrol'] as const) {
			expect(rows.find((row) => row.kind === kind)).toMatchObject({
				performedByProfileId: GONE_PROFILE,
				performedByName: null,
				subjectName: null,
				lines: [],
			});
		}
	});

	it('reads a two-product Treatment as one action holding both products', async () => {
		seedRows(insecticides, [
			{ id: 'bti', trade_name: 'VectoBac 12AS' },
			{ id: 'mets', trade_name: 'Altosid' },
		]);
		seedRows(units, [{ id: 'gal', abbreviation: 'gal' }]);
		seedRows(treatments, [
			{
				id: 't-basins',
				application_date: DAY,
				applicator_profile_id: GONE_PROFILE,
				application_method_id: null,
				created_at: new Date('2026-08-04T12:00:00Z'),
			},
		]);
		seedRows(applications, [
			{
				id: 'l-bti',
				treatment_id: 't-basins',
				insecticide_id: 'bti',
				amount_applied: 2,
				application_unit_id: 'gal',
				created_at: new Date('2026-08-04T12:00:00Z'),
			},
			{
				id: 'l-mets',
				treatment_id: 't-basins',
				insecticide_id: 'mets',
				amount_applied: 1,
				application_unit_id: 'gal',
				created_at: new Date('2026-08-04T12:00:01Z'),
			},
		]);

		const rows = await readDay();

		// One action, so the person's count and the kind breakdown read one.
		expect(rows).toHaveLength(1);
		expect(rows[0]?.kind).toBe('application');
		expect(rows[0]?.lines.map((line) => [line.insecticideName, line.amount])).toEqual([
			['VectoBac 12AS', 2],
			['Altosid', 1],
		]);
	});
});
