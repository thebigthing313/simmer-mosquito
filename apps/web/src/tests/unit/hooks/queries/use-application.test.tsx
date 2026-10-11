/** @vitest-environment jsdom */

/**
 * useApplication over a chemical application whose product, method, applicator, vehicle and
 * equipment the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useApplication } from '../../../../hooks/queries/use-application';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
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

describe('useApplication', () => {
	it('reads the product, method, applicator, vehicle and equipment names as null when none is in the client', async () => {
		const application = await readRecord(() => {
			const read = useApplication('a1');
			return { isReady: read.isReady, record: read.application };
		});

		expect(application).toMatchObject({
			insecticideId: GONE_PRODUCT,
			productName: null,
			methodId: GONE_METHOD,
			methodName: null,
			applicatorProfileId: GONE_PROFILE,
			applicatorName: null,
			vehicleId: GONE_VEHICLE,
			vehicleName: null,
			equipmentId: GONE_EQUIPMENT,
			equipmentName: null,
		});
	});
});
