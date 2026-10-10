/** @vitest-environment jsdom */

/**
 * useRecentSourceReductions over recent source reductions whose method and technician the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useRecentSourceReductions } from '../../../../hooks/queries/use-recent-source-reductions';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import {
	DAY,
	readList,
	seedUnresolvedActions,
	UNRESOLVED_TECHNICIAN_ACTION,
} from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedActions();
});

describe('useRecentSourceReductions', () => {
	it('reads the method and technician names as null when neither is in the client', async () => {
		const rows = await readList(() => {
			const read = useRecentSourceReductions(DAY);
			return { isReady: read.isReady, rows: read.actions };
		});

		expect(rows).toEqual([expect.objectContaining(UNRESOLVED_TECHNICIAN_ACTION)]);
	});
});
