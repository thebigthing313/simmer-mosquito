/** @vitest-environment jsdom */

/**
 * useControlActionsForDay over a day of control actions whose subject, method and performer the client does not hold.
 * `unresolved-performed-actions.ts` says why each name reads `null`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useControlActionsForDay } from '../../../../hooks/queries/use-control-actions-for-day';
import { installMemoryCollections } from '../../lib/collections/memory-collections';
import { readList } from './read-harness';
import {
	DAY,
	GONE_METHOD,
	GONE_PROFILE,
	seedUnresolvedActions,
} from './unresolved-performed-actions';

beforeEach(() => {
	installMemoryCollections();
	seedUnresolvedActions();
});

describe('useControlActionsForDay', () => {
	it('reads every subject, method and performer name as null when none is in the client', async () => {
		const rows = await readList(() => {
			const read = useControlActionsForDay(DAY);
			return { isReady: read.isReady, rows: read.actions };
		});

		expect(rows).toHaveLength(3);
		expect(rows.find((row) => row.kind === 'application')).toMatchObject({
			performedByProfileId: GONE_PROFILE,
			performedByName: null,
			subjectName: null,
			methodId: GONE_METHOD,
			methodName: null,
		});
		for (const kind of ['sourceReduction', 'biocontrol'] as const) {
			expect(rows.find((row) => row.kind === kind)).toMatchObject({
				performedByProfileId: GONE_PROFILE,
				performedByName: null,
				subjectName: null,
			});
		}
	});
});
