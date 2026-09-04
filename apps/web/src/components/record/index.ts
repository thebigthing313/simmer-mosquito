/**
 * The frame every record detail page is drawn in, and the states it forks
 * between.
 *
 * Fourteen pages had assembled the same arrangement by hand: a scroll container
 * at the app's measure, a back link, the fork between placeholder, unavailable
 * and record, a two-column split, and a danger zone whose acknowledgement
 * dialog has to be held above the card that raises it. Each carried its own
 * skeleton, and each edit route carried another.
 *
 * A page now supplies its record, its noun, its cards and its writes. Anything a
 * second detail page needs belongs here.
 */

export { EditFormSkeleton } from './edit-form-skeleton';
export { RecordDetailColumns } from './record-detail-columns';
export { RecordDetailHeader } from './record-detail-header';
export type { RecordDetailLayout } from './record-detail-layout';
export { RecordDetailPage, type RecordReading } from './record-detail-page';
export { RecordDetailSkeleton } from './record-detail-skeleton';
export { RecordUnavailable } from './record-unavailable';
