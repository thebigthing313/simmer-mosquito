import { describe, expect, it } from 'vitest';
import { collectionTimingStamps } from '../../../../routes/adult-surveillance/collections/-collection-timing';

/**
 * Both of a collection's timing columns come off one clock.
 *
 * They are stamped from the same typed days on the same save, and the domain
 * requires `collectedAt >= startedAt`. Read the clock twice and a trap set and
 * collected on the same morning stamps the set *after* the collection by the
 * milliseconds between the two calls — a save that fails on an ordering nobody
 * entered.
 */
describe('a collection set and collected on the same day', () => {
	const AGENCY = 'America/New_York';

	function exactValues(startedAt: string | null, collectedAt: string | null) {
		return {
			timingMode: 'exact_timestamps' as const,
			startedAt,
			collectedAt,
			collectionDate: null,
		};
	}

	it('never stamps the set after the collection', () => {
		// 09:00 on the agency's clock — before its midday, so both stamps clamp.
		const morning = new Date('2026-08-04T13:00:00.000Z');
		const stamps = collectionTimingStamps(exactValues('2026-08-04', '2026-08-04'), AGENCY, morning);

		expect(stamps.startedAt).not.toBeNull();
		expect(stamps.collectedAt).not.toBeNull();
		expect((stamps.collectedAt as string) >= (stamps.startedAt as string)).toBe(true);
	});

	it('keeps a set from an earlier day earlier', () => {
		const morning = new Date('2026-08-04T13:00:00.000Z');
		const stamps = collectionTimingStamps(exactValues('2026-08-02', '2026-08-04'), AGENCY, morning);

		expect(stamps.startedAt).toBe('2026-08-02T16:00:00.000Z');
		expect(stamps.collectedAt).toBe('2026-08-04T13:00:00.000Z');
	});

	it('files a date+duration collection under its collection date and sets nothing', () => {
		const stamps = collectionTimingStamps(
			{
				timingMode: 'collection_date_duration',
				startedAt: null,
				collectedAt: null,
				collectionDate: '2026-08-02',
			},
			AGENCY,
			new Date('2026-08-04T13:00:00.000Z'),
		);

		expect(stamps.startedAt).toBeNull();
		expect(stamps.collectedAt).toBe('2026-08-02T16:00:00.000Z');
	});
});
