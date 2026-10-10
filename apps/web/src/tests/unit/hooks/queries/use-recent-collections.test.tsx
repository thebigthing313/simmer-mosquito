/** @vitest-environment jsdom */

/**
 * useRecentCollections over a collection whose method the client does not
 * hold. `unresolved-adult-rows.ts` says why the name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useRecentCollections } from '../../../../hooks/queries/use-recent-collections';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { readList } from './read-harness';
import { SINCE, seedUnresolvedAdultRows, UNRESOLVED_METHOD, ZONE } from './unresolved-adult-rows';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedAdultRows();
});

describe('useRecentCollections', () => {
	it('reads the method name as null when the method is not in the client', async () => {
		const rows = await readList(() => {
			const read = useRecentCollections(SINCE, ZONE);
			return { isReady: read.isReady, rows: read.collections };
		});

		expect(rows[0]).toMatchObject(UNRESOLVED_METHOD);
	});
});
