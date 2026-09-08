/** @vitest-environment jsdom */

/**
 * Adult surveillance's read: what caught enough to warrant a response.
 *
 * The comparison is at or above, and the total is every species row on the
 * collection. The two ways of missing the list are worth telling apart: below
 * the threshold, and no threshold to be below.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useCollectionsOverThreshold } from '../../../../hooks/queries/use-collections-over-threshold';
import { collection_methods } from '../../../../lib/collections/collection_methods';
import { collection_species } from '../../../../lib/collections/collection_species';
import { collections } from '../../../../lib/collections/collections';
import { traps } from '../../../../lib/collections/traps';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const SINCE = '2026-08-01';
const ZONE = 'UTC';

/**
 * A collection, dated the `collection_date_duration` way by default: a plain
 * day, no instant. Pass both date columns to date one the other way.
 */
function collection(
	id: string,
	overrides: {
		readonly collection_method_id?: string;
		readonly trap_id?: string | null;
		readonly collected_at?: Date | null;
		readonly collection_date?: string | null;
		readonly collection_timing_mode?: string;
	} = {},
) {
	return {
		id,
		trap_id: 't1',
		collection_method_id: 'm1',
		collected_at: null,
		collection_date: '2026-08-04',
		collection_timing_mode: 'collection_date_duration',
		has_problem: false,
		is_zero_result: false,
		has_bycatch: false,
		...overrides,
	};
}

/** A collection dated the `exact_timestamps` way: an instant, no day. */
function collectionAt(id: string, collectedAt: string) {
	return collection(id, {
		collected_at: new Date(collectedAt),
		collection_date: null,
		collection_timing_mode: 'exact_timestamps',
	});
}

/** One species line under a collection. */
function identification(id: string, collectionId: string, count: number) {
	return { id, collection_id: collectionId, species_id: 's1', count, sex: null, status: null };
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(traps, [{ id: 't1', trap_name: 'Willow Slough', trap_code: 'WS-1' }]);
	seedRows(collection_methods, [
		{ id: 'm1', name: 'CDC light trap', action_threshold: 250 },
		{ id: 'm2', name: 'Gravid trap', action_threshold: null },
	]);
});

describe('useCollectionsOverThreshold', () => {
	it('keeps a collection over its method threshold, with the total and the threshold', async () => {
		seedRows(collections, [collection('c1')]);
		seedRows(collection_species, [identification('i1', 'c1', 400), identification('i2', 'c1', 12)]);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.collections).toEqual([
			expect.objectContaining({
				id: 'c1',
				total: 412,
				actionThreshold: 250,
				methodName: 'CDC light trap',
				trapName: 'Willow Slough',
			}),
		]);
	});

	it('keeps a total exactly equal to the threshold', async () => {
		seedRows(collections, [collection('c1')]);
		seedRows(collection_species, [identification('i1', 'c1', 250)]);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.collections.map((row) => row.id)).toEqual(['c1']);
	});

	it('drops a total below the threshold', async () => {
		seedRows(collections, [collection('c1')]);
		seedRows(collection_species, [identification('i1', 'c1', 249)]);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.collections).toEqual([]);
	});

	it('drops a collection whose method sets no threshold, whatever it caught', async () => {
		seedRows(collections, [collection('c1', { collection_method_id: 'm2' })]);
		seedRows(collection_species, [identification('i1', 'c1', 9000)]);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.collections).toEqual([]);
	});

	it('drops a collection with no species rows', async () => {
		// Zero result or still awaiting identification: either way there is nothing
		// to compare, so neither needs a flag of its own.
		seedRows(collections, [collection('c1')]);
		seedRows(collection_species, []);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.collections).toEqual([]);
		expect(result.current.isReady).toBe(true);
	});

	it('still drops a collection with no species rows when the threshold is zero', async () => {
		// Zero is a real setting, and `0 >= 0` would otherwise put every collection
		// made that way on the list, keyed out or not.
		installMemoryCollections();
		seedRows(traps, [{ id: 't1', trap_name: 'Willow Slough', trap_code: 'WS-1' }]);
		seedRows(collection_methods, [{ id: 'm1', name: 'CDC light trap', action_threshold: 0 }]);
		seedRows(collections, [collection('c1'), collection('c2')]);
		seedRows(collection_species, [identification('i1', 'c2', 3)]);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.collections.map((row) => row.id)).toEqual(['c2']);
	});

	it('keeps an ad-hoc collection, with a null trap rather than a missing one', async () => {
		seedRows(collections, [collection('c1', { trap_id: null })]);
		seedRows(collection_species, [identification('i1', 'c1', 300)]);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.collections).toEqual([
			expect.objectContaining({ id: 'c1', trapId: null, trapName: null, trapCode: null }),
		]);
	});

	it('windows both timing modes, so neither is silently empty', async () => {
		seedRows(collections, [
			collection('c1'),
			collectionAt('c2', '2026-08-06T15:00:00Z'),
			collection('c3', { collection_date: '2026-07-20' }),
			collectionAt('c4', '2026-07-18T15:00:00Z'),
		]);
		seedRows(collection_species, [
			identification('i1', 'c1', 300),
			identification('i2', 'c2', 300),
			identification('i3', 'c3', 300),
			identification('i4', 'c4', 300),
		]);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		// Newest first, and the two outside the window are gone.
		expect(result.current.collections.map((row) => row.id)).toEqual(['c2', 'c1']);
	});

	it('says whether any method sets a threshold at all', async () => {
		seedRows(collections, []);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.hasConfiguredThresholds).toBe(true);
	});

	it('says no thresholds are set when no method carries one', async () => {
		installMemoryCollections();
		seedRows(collection_methods, [{ id: 'm2', name: 'Gravid trap', action_threshold: null }]);
		seedRows(collections, []);

		const { result } = await renderRead(() => useCollectionsOverThreshold(SINCE, ZONE));

		expect(result.current.hasConfiguredThresholds).toBe(false);
		expect(result.current.collections).toEqual([]);
	});
});
