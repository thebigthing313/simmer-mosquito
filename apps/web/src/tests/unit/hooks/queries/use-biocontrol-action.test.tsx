/** @vitest-environment jsdom */

/**
 * useBiocontrolAction over a biocontrol release whose method and technician the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useBiocontrolAction } from '../../../../hooks/queries/use-biocontrol-action';
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

describe('useBiocontrolAction', () => {
	it('reads the method and technician names as null when neither is in the client', async () => {
		const record = await readRecord(() => {
			const read = useBiocontrolAction('b1');
			return { isReady: read.isReady, record: read.action };
		});

		expect(record).toMatchObject(UNRESOLVED_TECHNICIAN_ACTION);
	});
});
