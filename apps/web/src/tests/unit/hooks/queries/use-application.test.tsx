/** @vitest-environment jsdom */

/**
 * useApplication over a chemical application whose product, method and applicator the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useApplication } from '../../../../hooks/queries/use-application';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { GONE_METHOD, GONE_PRODUCT, GONE_PROFILE, readRecord, seedUnresolvedActions } from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedActions();
});

describe('useApplication', () => {
	it('reads the product, method and applicator names as null when none is in the client', async () => {
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
		});
	});
});
