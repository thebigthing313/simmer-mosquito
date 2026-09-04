import type { AdultCollectionTimingMode } from '@simmer-mosquito/sync';
import { getToday } from '../../../lib/get-today';
import { operationalDayAsTimestamp } from '../../../lib/local-date';

/** The timing fields a collection form holds, in either mode. */
interface CollectionTimingValues {
	readonly timingMode: AdultCollectionTimingMode;
	/** `YYYY-MM-DD` the trap was set — exact mode only, and optional there. */
	readonly startedAt: string | null;
	/** `YYYY-MM-DD` specimens were retrieved — exact mode. */
	readonly collectedAt: string | null;
	/** `YYYY-MM-DD` — date + duration mode. */
	readonly collectionDate: string | null;
}

/**
 * The two `timestamptz` columns a collection is stored with.
 *
 * `Date` rather than an ISO string, because that is what the row schema parses a
 * `timestamptz` into and what the write seam compares one against. A string here
 * would be a second spelling of the same instant, and the two would be compared
 * to each other on some save.
 */
export interface CollectionTimingStamps {
	readonly startedAt: Date | null;
	readonly collectedAt: Date | null;
}

/**
 * A collection's typed days as the instants they are stored at.
 *
 * Both columns here rather than one call apiece because they come off **one
 * clock**. `operationalDayAsInstant` clamps a same-day stamp to now — midday is
 * otherwise ahead of it all morning, and the domain refuses an operational date
 * in the future — so two calls for the same day read the clock twice and land
 * milliseconds apart. The domain also requires `collectedAt >= startedAt`, and a
 * trap set and collected on the same morning would stamp the set *after* the
 * collection and fail on an ordering nobody entered. Whichever call happened to
 * come second decided it, which is not something a call site can be expected to
 * keep in mind.
 *
 * The two timing modes store the day in different columns: `exact_timestamps`
 * keeps instants in both, `collection_date_duration` keeps the day in
 * `collection_date` and still carries `collected_at` for the surfaces that read
 * an effective date off it.
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
