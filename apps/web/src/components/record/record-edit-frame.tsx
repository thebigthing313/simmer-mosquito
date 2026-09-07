import type { ReactNode } from 'react';
import type { RecordReading } from './record-detail-page';
import { RecordUnavailable } from './record-unavailable';

/**
 * The record an edit route is about, a placeholder, or why there is neither.
 *
 * `RecordDetailPage` settled this question for the read half of the app and
 * each edit route answered it again by hand. Twelve agreed; six did not, and a
 * route that conflates the two facts tells a reader their record was deleted
 * when the read had merely failed, which sends them to stop looking instead of
 * to try again.
 *
 * The order is `RecordDetailPage`'s `Fork`, and its docblock is the reasoning.
 * This frame carries no chrome of its own because an edit route's child is not
 * always a form: three of them are a worklist beside a map. It renders whatever
 * child it is handed, and only with a record in hand.
 */
export function RecordEditFrame<TRecord>({
	children,
	noun,
	reading,
	skeleton,
	unavailableTitle,
}: {
	/** Drawn once the record is in hand, and not before. */
	readonly children: (record: TRecord) => ReactNode;
	/** Lowercase, as it reads mid-sentence: `habitat`, `weather station`. */
	readonly noun: string;
	readonly reading: RecordReading<TRecord>;
	/**
	 * What stands in while the collection is still answering, usually an
	 * `EditFormSkeleton`. The page owns its rows and its frame, because a
	 * placeholder reserving four fields for a form of two is a layout shift.
	 */
	readonly skeleton: ReactNode;
	/** Heads both unavailable states where the noun makes the wrong title. */
	readonly unavailableTitle?: string;
}): ReactNode {
	const title = unavailableTitle === undefined ? {} : { title: unavailableTitle };
	if (reading.isError === true) {
		return <RecordUnavailable layout="centered" noun={noun} reason="error" {...title} />;
	}
	if (reading.record !== null && reading.record !== undefined) {
		return children(reading.record);
	}
	if (!reading.isReady) {
		return skeleton;
	}
	return <RecordUnavailable layout="centered" noun={noun} reason="not-found" {...title} />;
}
