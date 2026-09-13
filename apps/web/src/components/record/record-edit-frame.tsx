import type { ReactNode } from 'react';
import type { RecordType } from '../../lib/record-nouns';
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
	reading,
	recordType,
	skeleton,
}: {
	/** Drawn once the record is in hand, and not before. */
	readonly children: (record: TRecord) => ReactNode;
	readonly reading: RecordReading<TRecord>;
	/** Which record this route edits. Its noun comes from `lib/record-nouns.ts`. */
	readonly recordType: RecordType;
	/**
	 * What stands in while the collection is still answering, usually an
	 * `EditFormSkeleton`. The page owns its rows and its frame, because a
	 * placeholder reserving four fields for a form of two is a layout shift.
	 */
	readonly skeleton: ReactNode;
}): ReactNode {
	if (reading.isError === true) {
		return <RecordUnavailable layout="centered" reason="error" recordType={recordType} />;
	}
	if (reading.record !== null && reading.record !== undefined) {
		return children(reading.record);
	}
	if (!reading.isReady) {
		return skeleton;
	}
	return <RecordUnavailable layout="centered" reason="not-found" recordType={recordType} />;
}
