import type { ComponentProps, ReactNode } from 'react';
import type { RecordType } from '../../lib/record-nouns';
import { type AskAcknowledged, useAcknowledgedWrite } from '../acknowledged-write';
import { detailBodyClass } from './detail-page-shell';
import type { RecordDetailLayout } from './record-detail-layout';
import { RecordDetailSkeleton } from './record-detail-skeleton';
import { RecordUnavailable } from './record-unavailable';

/**
 * No questions. A page that declares no refusals still gets a runner, and this
 * is what keeps it from inheriting the hook's default map, which is the mission
 * stop's. Hoisted so the hook's callbacks keep their identity across renders.
 */
const NO_REFUSALS = {} as const;

/** What a page knows about its record, before the frame decides what to draw. */
export interface RecordReading<TRecord> {
	/** The collection has answered. False means the record may yet arrive. */
	readonly isReady: boolean;
	/** The read failed. Pass it wherever the hook returns it. */
	readonly isError?: boolean | undefined;
	/** The record, or `null`/`undefined` when the collection holds no such row. */
	readonly record: TRecord | null | undefined;
}

interface RecordDetailBase {
	readonly layout: RecordDetailLayout;
	/** Which record this page is about. Its noun comes from `lib/record-nouns.ts`. */
	readonly recordType: RecordType;
	/**
	 * The refusals this record's delete may answer, from
	 * `lib/acknowledgement-copy.ts`.
	 *
	 * Declaring them here is what puts `useAcknowledgedWrite` above the content,
	 * which is the placement the delete needs and the one a page gets wrong. The
	 * delete is optimistic, so the row leaves its collection the moment the
	 * button is pressed and the danger zone unmounts before the refusal lands. A
	 * hook held inside the content would be setting state on a component that is
	 * gone, and the question would never be asked. The frame outlives the
	 * rollback because it is what renders the unavailable state in the content's
	 * place.
	 *
	 * Omit it for a record whose delete has no acknowledgeable refusal, which is
	 * the address, region and contact. `askDelete` then has nothing to ask about
	 * and every refusal is handed back to the caller, which is what those pages
	 * did with no runner at all.
	 */
	readonly deleteRefusals?: Readonly<Record<string, string>>;
}

/** A page that forks on a flag, which is thirteen of the fourteen. */
interface RecordDetailReadingProps<TRecord> extends RecordDetailBase {
	readonly reading: RecordReading<TRecord>;
	/** The record's content, given a runner for a delete that may be questioned. */
	readonly children: (record: TRecord, askDelete: AskAcknowledged) => ReactNode;
	readonly body?: undefined;
}

/**
 * A page whose readiness is a Suspense boundary rather than a flag, which is
 * the habitat.
 *
 * It hands over the whole body and uses {@link RecordDetailSkeleton} as its
 * fallback, so the placeholder is still the frame's and still follows the
 * layout. The unavailable state stays with the page for the same reason the
 * explorer's body callers report their own emptiness: the frame cannot look
 * inside a suspended tree and find out there is no record.
 */
interface RecordDetailBodyProps extends RecordDetailBase {
	readonly body: (askDelete: AskAcknowledged) => ReactNode;
	readonly reading?: undefined;
	readonly children?: undefined;
}

/**
 * The frame every record detail page is drawn in.
 *
 * It owns the scroll container, the fork between placeholder, unavailable and
 * content, and the acknowledgement dialog a delete may raise. A page supplies
 * its record, its record type, its cards and its writes, and draws them in
 * {@link DetailPageShell}, which owns the header bar and the measure.
 *
 * That measure is `record` rather than the 1200px `page` one, so a detail page
 * fills the stage instead of sitting in a centred column with a quarter of a
 * 1920 screen empty beside it. What keeps that from stretching the content is
 * that the cards carry their own widths: a fact list stops at 34rem, and only
 * the maps and the child-record tables are greedy. See `pageContainer`.
 *
 * Fourteen pages assembled this by hand and answered its questions
 * independently. Seven of them had `isError` to hand and drew the missing-record
 * state anyway, so a read that failed said "could not be found, or you do not
 * have access to it" and told the reader to stop looking. The fork lives here
 * now, and `isError` is a prop the page passes rather than a branch it remembers
 * to write.
 */
export function RecordDetailPage<TRecord>(
	props: RecordDetailReadingProps<TRecord> | RecordDetailBodyProps,
) {
	const { layout, recordType, deleteRefusals } = props;
	// With nothing askable every refusal is rethrown, so a page that declares no
	// refusals gets exactly the behaviour it had before it had a runner at all.
	const { run, dialog } = useAcknowledgedWrite(
		deleteRefusals === undefined
			? { askable: NO_REFUSALS, ask: false }
			: { askable: deleteRefusals, ask: true },
	);

	return (
		/*
		 * The scroll box is also the `record` container every split on this page
		 * is measured against: see `detail-page-shell.tsx`. It is the stage, the
		 * window less the two rails, which is the box the page has to divide.
		 *
		 * The header is `sticky` and a header only sticks to the box it scrolls
		 * in, so nothing may sit between this element and the one the page draws
		 * its bar as. That is why the fork's states each render their own frame
		 * rather than being wrapped in one here.
		 */
		<div className="@container/record h-full min-h-0 overflow-y-auto">
			{props.body === undefined ? (
				<Fork askDelete={run} layout={layout} reading={props.reading} recordType={recordType}>
					{props.children}
				</Fork>
			) : (
				props.body(run)
			)}
			{dialog}
		</div>
	);
}

/**
 * The record, a placeholder, or why there is neither.
 *
 * The order is the whole point. A failed read is not a missing record, so it is
 * asked first. A record the page already holds is drawn whether or not its
 * collection has finished answering, because a placeholder over a record that
 * is on screen is a flash for nothing. Readiness then decides the rest: not yet
 * answered means the record may still arrive, answered means it will not.
 */
function Fork<TRecord>({
	askDelete,
	children,
	layout,
	reading,
	recordType,
}: {
	readonly askDelete: AskAcknowledged;
	readonly children: (record: TRecord, askDelete: AskAcknowledged) => ReactNode;
	readonly layout: RecordDetailLayout;
	readonly reading: RecordReading<TRecord>;
	readonly recordType: RecordType;
}) {
	if (reading.isError === true) {
		return <Unavailable reason="error" recordType={recordType} />;
	}
	if (reading.record !== null && reading.record !== undefined) {
		return children(reading.record, askDelete);
	}
	if (!reading.isReady) {
		return <RecordDetailSkeleton layout={layout} />;
	}
	return <Unavailable reason="not-found" recordType={recordType} />;
}

/**
 * The missing-record state, indented to where the record would have been.
 *
 * No header bar over it: the bar names a record, and this is the state where
 * there is not one to name. The breadcrumb above the page still says which page
 * the reader asked for.
 */
function Unavailable(props: ComponentProps<typeof RecordUnavailable>) {
	return (
		<div className={detailBodyClass()}>
			<RecordUnavailable {...props} />
		</div>
	);
}
