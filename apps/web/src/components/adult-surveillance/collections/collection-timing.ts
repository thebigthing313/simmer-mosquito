import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { getToday } from '../../../lib/get-today';
import { operationalDayAsTimestamp } from '../../../lib/local-date';

/** The timing fields a collection form holds, in either mode. */
interface CollectionTimingValues {
	readonly timingMode: AdultCollectionTimingMode;
	/** `YYYY-MM-DD` the trap was set: exact mode only, and optional there. */
	readonly startedAt: string | null;
	/** `YYYY-MM-DD` specimens were retrieved: exact mode. */
	readonly collectedAt: string | null;
	/** `YYYY-MM-DD`: date + duration mode. */
	readonly collectionDate: string | null;
}

/**
 * The two `timestamptz` columns a collection is stored with, as the `Date` the
 * row schema parses and the write seam compares.
 */
export interface CollectionTimingStamps {
	readonly startedAt: Date | null;
	readonly collectedAt: Date | null;
}

/**
 * A collection's typed days as the instants they are stored at, off one clock.
 * `operationalDayAsInstant` clamps a same-day stamp to now, and the domain
 * requires `collectedAt >= startedAt`, so two separate calls for the same day
 * can land milliseconds apart in the wrong order. Under
 * `collection_date_duration` the `collectedAt` returned here is the typed day
 * as an instant for the optimistic row; the server reads none off that payload.
 */
export function collectionTimingStamps(
	values: CollectionTimingValues,
	timeZone: string,
	now: Date = getToday(),
): CollectionTimingStamps {
	const exact = values.timingMode === 'exact_timestamps';
	return {
		startedAt: exact ? operationalDayAsTimestamp(values.startedAt, timeZone, now) : null,
		collectedAt: operationalDayAsTimestamp(
			exact ? values.collectedAt : values.collectionDate,
			timeZone,
			now,
		),
	};
}
