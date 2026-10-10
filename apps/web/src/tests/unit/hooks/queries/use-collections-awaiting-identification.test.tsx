/** @vitest-environment jsdom */

/**
 * useCollectionsAwaitingIdentification over a collection whose method the
 * client does not hold. `unresolved-adult-rows.ts` says why the name reads
 * `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useCollectionsAwaitingIdentification } from '../../../../hooks/queries/use-collections-awaiting-identification';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { SINCE, seedUnresolvedAdultRows, UNRESOLVED_METHOD, ZONE } from './unresolved-adult-rows';
import { readList } from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedAdultRows();
});

describe('useCollectionsAwaitingIdentification', () => {
	it('reads the method name as null when the method is not in the client', async () => {
		const rows = await readList(() => {
			const read = useCollectionsAwaitingIdentification(SINCE, ZONE);
			return { isReady: read.isReady, rows: read.awaiting };
		});

		expect(rows[0]).toMatchObject(UNRESOLVED_METHOD);
	});
});
