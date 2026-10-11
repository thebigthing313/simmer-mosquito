/** @vitest-environment jsdom */

/**
 * useTrap over a trap whose method and lure the client does not hold.
 * `unresolved-adult-rows.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useTrap } from '../../../../hooks/queries/use-trap';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { readRecord } from './read-harness';
import { seedUnresolvedAdultRows, UNRESOLVED_METHOD_AND_LURE } from './unresolved-adult-rows';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedAdultRows();
});

describe('useTrap', () => {
	it('reads the method and lure names as null when neither is in the client', async () => {
		const trap = await readRecord(() => {
			const read = useTrap('t1');
			return { isReady: read.isReady, record: read.trap };
		});

		expect(trap).toMatchObject(UNRESOLVED_METHOD_AND_LURE);
	});
});
