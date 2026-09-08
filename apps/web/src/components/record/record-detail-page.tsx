import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { type AskAcknowledged, useAcknowledgedWrite } from '../acknowledged-write';
import type { RecordDetailLayout } from './record-detail-layout';
import { RecordDetailSkeleton } from './record-detail-skeleton';
import { RecordUnavailable } from './record-unavailable';

/**
 * No questions. A page that declares no refusals still gets a runner, and this
 * is what keeps it from inheriting the hook's default map, which is the mission
 * stop's. Hoisted so the hook's callbacks keep their identity across renders.
 */
const NO_REFUSALS = {} as const;

/**
 * Where the back link goes.
 *
 * `to` is widened to every route rather than to this page's domain, the same
 * trade `RecordFormPage` makes: a component cannot know each domain's routes, so
 * it takes the union and a wrong string is still refused. A page that wants the
 * narrower check declares its own type for the constant it passes.
 */
interface RecordDetailBack {
	readonly to: NonNullable<LinkProps['to']>;
	readonly params?: Readonly<Record<string, string>>;
	/** The whole link text: `Back to Habitats`. */
	readonly label: string;
}

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
	readonly back: RecordDetailBack;
	/** Lowercase, as it reads mid-sentence: `collection`, `weather station`. */
	readonly noun: string;
	/**
	 * Heads the unavailable state where the noun does not make the right title:
	 * a source reduction action is filed under "Source Reduction".
	 *
	 * The title alone, because the same override has to hold for both the failed
	 * read and the missing record. A description would not: it says which of the
	 * two happened, which is exactly what the frame decides.
	 */
	readonly unavailableTitle?: string;
	/** Controls that belong beside the back link rather than in the header. */
	readonly actions?: ReactNode;
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
 * It owns the scroll container, the measure, the back link, the fork between
 * placeholder, unavailable and content, and the acknowledgement dialog a delete
 * may raise. A page supplies its record, its noun, its cards and its writes.
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
	const { layout, back, noun, unavailableTitle, actions, deleteRefusals } = props;
	// With nothing askable every refusal is rethrown, so a page that declares no
	// refusals gets exactly the behaviour it had before it had a runner at all.
	const { run, dialog } = useAcknowledgedWrite(
		deleteRefusals === undefined
			? { askable: NO_REFUSALS, ask: false }
			: { askable: deleteRefusals, ask: true },
	);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: layout.padding ?? 'detail' })}>
				{actions === undefined ? (
					<BackTo back={back} />
				) : (
					<div className="flex items-center justify-between gap-3">
						<BackTo back={back} />
						<div className="flex flex-wrap items-center gap-2">{actions}</div>
					</div>
				)}
				{props.body === undefined ? (
					<Fork
						askDelete={run}
						layout={layout}
						noun={noun}
						reading={props.reading}
						unavailableTitle={unavailableTitle}
					>
						{props.children}
					</Fork>
				) : (
					props.body(run)
				)}
				{dialog}
			</div>
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
	noun,
	reading,
	unavailableTitle,
}: {
	readonly askDelete: AskAcknowledged;
	readonly children: (record: TRecord, askDelete: AskAcknowledged) => ReactNode;
	readonly layout: RecordDetailLayout;
	readonly noun: string;
	readonly reading: RecordReading<TRecord>;
	readonly unavailableTitle: string | undefined;
}) {
	const title = unavailableTitle === undefined ? {} : { title: unavailableTitle };
	if (reading.isError === true) {
		return <RecordUnavailable noun={noun} reason="error" {...title} />;
	}
	if (reading.record !== null && reading.record !== undefined) {
		return children(reading.record, askDelete);
	}
	if (!reading.isReady) {
		return <RecordDetailSkeleton layout={layout} />;
	}
	return <RecordUnavailable noun={noun} reason="not-found" {...title} />;
}

function BackTo({ back }: { readonly back: RecordDetailBack }) {
	return (
		<Link className={backLink()} {...{ to: back.to, params: back.params ?? {} }}>
			<ArrowLeftIcon aria-hidden="true" />
			{back.label}
		</Link>
	);
}
