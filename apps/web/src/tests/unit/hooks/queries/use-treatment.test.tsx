/** @vitest-environment jsdom */

/**
 * useTreatment over a Treatment whose method, applicator, vehicle and
 * equipment the client does not hold, and whose one line names a product that
 * is not there either. `unresolved-performed-actions.ts` says why each name
 * reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useTreatment } from '../../../../hooks/queries/use-treatment';
import { formulations } from '../../../../lib/collections/formulations';
import { treatments } from '../../../../lib/collections/treatments';
import { units } from '../../../../lib/collections/units';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { readRecord } from './read-harness';
import {
	GONE_EQUIPMENT,
	GONE_METHOD,
	GONE_PRODUCT,
	GONE_PROFILE,
	GONE_VEHICLE,
	seedUnresolvedActions,
} from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedActions();
});

describe('useTreatment', () => {
	it('reads the method, applicator, vehicle, equipment and product names as null when none is in the client', async () => {
		const treatment = await readRecord(() => {
			const read = useTreatment('a1');
			return { isReady: read.isReady, record: read.treatment };
		});

		expect(treatment).toMatchObject({
			methodId: GONE_METHOD,
			methodName: null,
			applicatorProfileId: GONE_PROFILE,
			applicatorName: null,
			vehicleId: GONE_VEHICLE,
			vehicleName: null,
			equipmentId: GONE_EQUIPMENT,
			equipmentName: null,
		});
		expect(treatment?.lines).toEqual([
			expect.objectContaining({
				id: 'a1-line',
				insecticideId: GONE_PRODUCT,
				insecticideName: null,
			}),
		]);
	});

	it('reads the Formulation it was mixed from and the mix total', async () => {
		seedRows(formulations, [{ id: 'f1', formulation_name: 'Mix A' }]);
		seedRows(units, [{ id: 'u1', abbreviation: 'gal' }]);
		seedRows(treatments, [
			{
				id: 't1',
				application_date: '2026-08-04',
				formulation_id: 'f1',
				mix_amount: 78,
				mix_unit_id: 'u1',
				created_at: new Date('2026-08-04T12:00:00Z'),
			},
		]);

		const treatment = await readRecord(() => {
			const read = useTreatment('t1');
			return { isReady: read.isReady, record: read.treatment };
		});

		expect(treatment).toMatchObject({
			formulationId: 'f1',
			formulationName: 'Mix A',
			mixAmount: 78,
			mixUnitAbbreviation: 'gal',
			lines: [],
		});
	});
});
