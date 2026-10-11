/** @vitest-environment jsdom */

/**
 * useSourceReduction over a source reduction whose method and technician the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useSourceReduction } from '../../../../hooks/queries/use-source-reduction';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { readRecord } from './read-harness';
import {
	seedUnresolvedActions,
	UNRESOLVED_TECHNICIAN_ACTION,
} from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedActions();
});

describe('useSourceReduction', () => {
	it('reads the method and technician names as null when neither is in the client', async () => {
		const record = await readRecord(() => {
			const read = useSourceReduction('s1');
			return { isReady: read.isReady, record: read.action };
		});

		expect(record).toMatchObject(UNRESOLVED_TECHNICIAN_ACTION);
	});
});
