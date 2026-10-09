/** @vitest-environment jsdom */

/**
 * A trap's history: windowed by season through `collectedSince`, with the
 * pending row kept beside it, and each row handed up with its day.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useTrapCollections } from '../../../../hooks/queries/use-trap-collections';
import { collections } from '../../../../lib/collections/collections';
import { todayInTimeZone } from '../../../../lib/local-date';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const ZONE = 'America/Chicago';

/** A collection on trap `t1`, undated unless a date is passed. */
function collection(id: string, collectionDate: string | null = null) {
	return {
		id,
		trap_id: 't1',
		collection_method_id: 'm1',
		collected_at: null,
		collection_date: collectionDate,
		collection_timing_mode:
			collectionDate === null ? 'exact_timestamps' : 'collection_date_duration',
		has_problem: false,
		is_zero_result: false,
		has_bycatch: false,
	};
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useTrapCollections', () => {
	it('lists a pending collection beside the windowed ones, each with its day', async () => {
		const thisYear = Number(todayInTimeZone(ZONE).slice(0, 4));
		seedRows(collections, [
			collection('pending'),
			collection('this-season', `${thisYear}-06-01`),
			collection('long-ago', `${thisYear - 5}-06-01`),
		]);

		const { result } = await renderRead(() =>
			useTrapCollections('t1', { seasons: 1, timeZone: ZONE }),
		);

		expect(
			result.current.collections
				.map((row) => ({ id: row.id, effectiveDate: row.effectiveDate }))
				.sort((a, b) => a.id.localeCompare(b.id)),
		).toEqual([
			{ id: 'pending', effectiveDate: null },
			{ id: 'this-season', effectiveDate: `${thisYear}-06-01` },
		]);
	});
});
