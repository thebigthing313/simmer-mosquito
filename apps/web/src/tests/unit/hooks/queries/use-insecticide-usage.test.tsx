/** @vitest-environment jsdom */

/**
 * useInsecticideUsage over insecticide usage whose insecticide the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useInsecticideUsage } from '../../../../hooks/queries/use-insecticide-usage';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { readList } from './read-harness';
import { DAY, GONE_PRODUCT, seedUnresolvedActions } from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedActions();
});

describe('useInsecticideUsage', () => {
	it('reads the insecticide name as null when the product is not in the client', async () => {
		const rows = await readList(() => {
			const read = useInsecticideUsage(DAY);
			return { isReady: read.isReady, rows: read.usage };
		});

		expect(rows).toEqual([
			expect.objectContaining({ insecticideId: GONE_PRODUCT, name: null, applicationCount: 1 }),
		]);
	});
});
