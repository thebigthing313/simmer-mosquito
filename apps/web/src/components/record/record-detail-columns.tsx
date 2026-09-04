import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import type { RecordDetailAside, RecordDetailLayout } from './record-detail-layout';

/**
 * The split a record detail page reads in: what the record is on the left, and
 * what is said about it on the right.
 *
 * Shared with {@link RecordDetailSkeleton}, which stands in the same shape
 * before the record arrives. Nothing else should write these class strings.
 */
export function detailGridClass(aside: RecordDetailAside | undefined): string {
	return cn(
		'grid items-start gap-5',
		aside === 'wide' ? 'xl:grid-cols-[minmax(0,1fr)_22rem]' : '',
		aside === 'narrow' ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : '',
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
			: layout.aside === 'narrow'
				? 'lg:sticky lg:top-0 lg:self-start'
				: 'xl:sticky xl:top-0 xl:self-start',
	);
}

/**
 * A record's cards, under its header.
 *
 * The header sits outside the split rather than in the left column, because it
 * names the whole record and a title indented to the width of one column reads
 * as a heading for that column alone.
 *
 * The danger zone is not a slot here. It is a card, and every page but two puts
 * it last in the primary column, so a page passes it as the last child of
 * `children` and the two that keep it beside the fact cards pass it in `aside`.
 * What the frame owns is holding the acknowledgement dialog above it, which is
 * the part a page gets wrong: see {@link RecordDetailPage}.
 */
export function RecordDetailColumns({
	layout,
	header,
	aside,
	children,
}: {
	readonly layout: RecordDetailLayout;
	/** The record's name and the controls that act on it. */
	readonly header: ReactNode;
	/** The side column. Omit on a page whose layout declares no `aside`. */
	readonly aside?: ReactNode;
	/** The primary column. */
	readonly children: ReactNode;
}) {
	return (
		<>
			{header}
			<div className={detailGridClass(layout.aside)}>
				<div className={detailMainClass(layout)}>{children}</div>
				{aside === undefined ? null : <div className={detailAsideClass(layout)}>{aside}</div>}
			</div>
		</>
	);
}
