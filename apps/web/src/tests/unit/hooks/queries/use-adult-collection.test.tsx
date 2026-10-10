/** @vitest-environment jsdom */

/**
 * useAdultCollection over a collection whose method and lure the client does
 * not hold. `unresolved-adult-rows.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAdultCollection } from '../../../../hooks/queries/use-adult-collection';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { seedUnresolvedAdultRows, UNRESOLVED_METHOD_AND_LURE } from './unresolved-adult-rows';
import { readRecord } from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedAdultRows();
});

describe('useAdultCollection', () => {
	it('reads the method and lure names as null when neither is in the client', async () => {
		const collection = await readRecord(() => {
			const read = useAdultCollection('c1');
			return { isReady: read.isReady, record: read.collection };
		});

		expect(collection).toMatchObject(UNRESOLVED_METHOD_AND_LURE);
	});
});
