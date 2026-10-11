/** @vitest-environment jsdom */

/**
 * useRecentBiocontrolActions over recent biocontrol releases whose method and technician the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useRecentBiocontrolActions } from '../../../../hooks/queries/use-recent-biocontrol-actions';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { readList } from './read-harness';
import {
	DAY,
	seedUnresolvedActions,
	UNRESOLVED_TECHNICIAN_ACTION,
} from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedActions();
});

describe('useRecentBiocontrolActions', () => {
	it('reads the method and technician names as null when neither is in the client', async () => {
		const rows = await readList(() => {
			const read = useRecentBiocontrolActions(DAY);
			return { isReady: read.isReady, rows: read.actions };
		});

		expect(rows).toEqual([expect.objectContaining(UNRESOLVED_TECHNICIAN_ACTION)]);
	});
});
