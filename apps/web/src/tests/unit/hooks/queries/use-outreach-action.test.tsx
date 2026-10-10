/** @vitest-environment jsdom */

/**
 * useOutreachAction over an Outreach Action whose method and technician the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useOutreachAction } from '../../../../hooks/queries/use-outreach-action';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { readRecord, seedUnresolvedActions, UNRESOLVED_TECHNICIAN_ACTION } from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedActions();
});

describe('useOutreachAction', () => {
	it('reads the method and technician names as null when neither is in the client', async () => {
		const record = await readRecord(() => {
			const read = useOutreachAction('o1');
			return { isReady: read.isReady, record: read.action };
		});

		expect(record).toMatchObject(UNRESOLVED_TECHNICIAN_ACTION);
	});
});
