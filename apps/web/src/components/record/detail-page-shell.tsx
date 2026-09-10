import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import { DetailPageHeader, type DetailPageHeaderProps } from './detail-page-header';
import type { RecordDetailAside, RecordDetailLayout } from './record-detail-layout';

/*
 * Every width in this file is a container query against `record`, the container
 * `RecordDetailPage` declares on its scroll box. That box is the stage: the
 * window less the 304px the two rails spend on chrome.
 *
 * These used to be viewport media queries, and a viewport query is measuring
 * the wrong box. Measured on the contact page: at a viewport of 1279 the main
 * column was 896px, and at 1280 the `xl:` split fired and it dropped to 525px.
 * One pixel wider made the record's own content 371px narrower, and nothing on
 * screen said why. A container query asks about the space actually being
 * divided, so the split happens when there is room for it, and the rails can
 * change width without every detail page picking a new breakpoint.
 */

/**
 * The split a record detail page reads in: what the record is on the left, and
 * what is said about it on the right.
 *
 * Shared with {@link RecordDetailSkeleton}, which stands in the same shape
 * before the record arrives. Nothing else should write these class strings.
 *
 * The threshold is the rail's 22rem plus the gap plus 40rem, which is the
 * narrowest a main column can be and still hold a child record's table without
 * the columns fighting. Below it the rail is worth more stacked underneath,
 * where it gets the whole measure.
 */
export function detailGridClass(aside: RecordDetailAside | undefined): string {
	return cn(
		'grid items-start gap-5',
		aside === undefined ? '' : '@min-[64rem]/record:grid-cols-[minmax(0,1fr)_22rem]',
	);
}

export function detailMainClass(layout: RecordDetailLayout): string {
	return cn('grid min-w-0 content-start', layout.mainGap === 'tight' ? 'gap-3' : 'gap-5');
}

export function detailAsideClass(layout: RecordDetailLayout): string {
	return cn(
		'grid content-start gap-5',
		layout.stickyAside !== true
			? ''
			: '@min-[64rem]/record:sticky @min-[64rem]/record:top-0 @min-[64rem]/record:self-start',
	);
}

/**
 * Two cards that share one row of the main column.
 *
 * The threshold is read off the record container rather than off this row's own
 * width, which is a deliberate approximation: the main column is the container
 * less the 22rem aside and the gap, so 84rem of container leaves it about 60rem
 * and each half about 29rem. Measuring this row itself would need
 * `container-type` on it, and that brings containment, which makes the row a
 * containing block for anything absolutely positioned inside a card. The map
 * card lives in one of these rows, so the cheaper arithmetic is the safer
 * answer.
 *
 * It replaces the `lg:grid-cols-2` two files wrote by hand, which split on the
 * viewport and so split too early: at a viewport of 1024 the main column is
 * about 660px, and the habitat page's own comment records a folder row wrapping
 * at the 328px half that produced.
 */
export const detailCardRowClass = 'grid gap-5 @min-[84rem]/record:grid-cols-2';

/** A row of cards that share the main column's width. */
function DetailCardRow({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}) {
	return <div className={cn(detailCardRowClass, className)}>{children}</div>;
}

/**
 * The frame one record is drawn in: a pinned header, then the record's cards.
 *
 * The header sits outside the column split rather than in the left column,
 * because it names the whole record and a title indented to the width of one
 * column reads as a heading for that column alone. It is also `sticky`, which
 * only works on a direct child of the scroll box, so it is a sibling of the
 * padded body rather than the first row of it. See {@link DetailPageHeader}.
 *
 * ## Where a record's facts go
 *
 * `lead` and `facts` are the record itself: where it is, and what it says.
 * They open the main column as one row, so at a width that has room for it the
 * map and the fact list read side by side.
 *
 * Twelve of the thirteen pages used to stack the fact card in the side rail
 * above the comments, and the thirteenth put it beside the map. Which one was
 * right only showed up once the page stopped sitting in a 1200px column:
 * measured on the trap page at 1920, the rail arrangement left the map 1130px
 * wide and 280px tall, a four-to-one letterbox, with a four-column table spread
 * under it, while the habitat page's map and facts each took half a row and
 * read the same as they always had. So the rail is the conversation now, and
 * the record's own facts sit next to its geography.
 *
 * Both are optional, because three pages have no map and one has no separate
 * fact card. A page with only one of them gets a single card at the full width
 * of the main column, which is what it would have got anyway.
 *
 * The danger zone is not a slot here. It is a card, and every page puts it last
 * in the primary column, so a page passes it as the last child of `children`.
 * What the frame owns is holding the acknowledgement dialog above it, which is
 * the part a page gets wrong: see {@link RecordDetailPage}.
 */
export function DetailPageShell({
	layout,
	header,
	lead,
	facts,
	aside,
	children,
}: {
	readonly layout: RecordDetailLayout;
	/** The record's name, type, flags, Tags and the controls that act on it. */
	readonly header: DetailPageHeaderProps;
	/** Where the record is: its location card, usually a map. */
	readonly lead?: ReactNode;
	/** What the record says: its fact card, and any custom fields under it. */
	readonly facts?: ReactNode;
	/** The side column. Omit on a page whose layout declares no `aside`. */
	readonly aside?: ReactNode;
	/** The primary column, under the lead row. */
	readonly children: ReactNode;
}) {
	return (
		<>
			<DetailPageHeader {...header} />
			<div className={detailBodyClass()}>
				<div className={detailGridClass(layout.aside)}>
					<div className={detailMainClass(layout)}>
						{lead === undefined && facts === undefined ? null : (
							<DetailCardRow>
								{lead}
								{/* A run of fact cards stacks inside the half rather than beside it. */}
								{facts === undefined ? null : (
									<div className="grid content-start gap-5">{facts}</div>
								)}
							</DetailCardRow>
						)}
						{children}
					</div>
					{aside === undefined ? null : <div className={detailAsideClass(layout)}>{aside}</div>}
				</div>
			</div>
		</>
	);
}

/**
 * The measure and padding the record's cards sit in, under the pinned header.
 *
 * Exported because the skeleton and the unavailable state stand in the same
 * body, and a page whose content is missing should still be indented to where
 * the content would have been.
 */
export function detailBodyClass(): string {
	return pageContainer({ gap: 'detail', measure: 'record', padding: 'detail' });
}
