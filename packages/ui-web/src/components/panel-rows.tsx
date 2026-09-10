import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import type { ReactNode } from 'react';

/** What a card knows about the read behind its rows. */
export interface PanelRowsReading<Row> {
	/** The read failed. Outranks everything below, including `isReady`. */
	readonly isError?: boolean | undefined;
	/** The collection has answered. An unready read has no empty state, only a placeholder. */
	readonly isReady: boolean;
	readonly rows: readonly Row[];
}

/** The words on one of the three states that draw no rows. */
export interface PanelRowsMessage {
	/** Title case, the way the other titles in a card header read. */
	readonly title: string;
	readonly description: ReactNode;
}

/**
 * The body of a child-record card: error, then placeholder, then empty, then
 * rows.
 *
 * `Panel` above holds the header a summary surface repeats. This holds the
 * fork under it, which the seven child-record cards on the detail pages each
 * wrote by hand and none of them asserted. `record-detail-page.test.tsx` is the
 * same fork one level up, written fourteen times before it was collapsed; this
 * is that fork one level down.
 *
 * The order is the whole of it, and only the first branch is arguable. A read
 * that failed is not a card with nothing in it: telling a reader there are no
 * samples when the request 500'd is a wrong answer rather than a slow one, so
 * `isError` is read before readiness and before the count. A read that has not
 * answered yet is not empty either, which is why the count is last.
 *
 * `instead` is a fifth branch and sits between the placeholder and the count.
 * It is for the card whose record answers for its own children, and the one
 * that has it is `ResultsCard`: a collection marked zero result is not a
 * collection nobody has keyed out yet, and the two read differently.
 *
 * One skeleton height, `h-16`. The seven copies wrote three, `h-12`, `h-14` and
 * `h-16`, with nothing anywhere saying why they differed. 16 is what these rows
 * measure: a link and a badge on one line, a detail line under it, and the
 * `py-2.5` either side. A placeholder shorter than the row it stands for makes
 * the card grow when the rows land, which moves everything below it on the
 * page.
 *
 * Two placeholder rows, not four, because a child-record card is read beside
 * its record rather than as a list of its own.
 */
export function PanelRows<Row>({
	reading,
	icon,
	unavailable,
	instead,
	empty,
	wrap = 'list',
	children,
}: {
	readonly reading: PanelRowsReading<Row>;
	/** Drawn in every message state. Pass it `aria-hidden`, the title carries the meaning. */
	readonly icon: ReactNode;
	/** Shown when the read failed. Say what could not be loaded, not why. */
	readonly unavailable: PanelRowsMessage;
	/**
	 * Shown when the record itself has already answered for its children, in
	 * place of both the rows and the empty state.
	 *
	 * It sits under the failure and the placeholder and over the count, because
	 * it is true whatever the read holds: a collection marked zero result has no
	 * species, and one whose last species row has not finished syncing away is
	 * still a zero result rather than a list of one.
	 */
	readonly instead?: PanelRowsMessage | undefined;
	/**
	 * Shown when the read answered with nothing.
	 *
	 * Optional, because one card's zero-row state is not a card-level empty:
	 * `IdentificationCard` still draws its add row and its disposition controls
	 * for a sample nobody has keyed out, so the words about there being no
	 * species sit beside those rather than replacing them. Left out, a read that
	 * answered with nothing goes to `children`, which then owns that state.
	 */
	readonly empty?: PanelRowsMessage | undefined;
	/**
	 * What goes around the rows.
	 *
	 * `list` is the default and is what a row-per-record card wants: `children`
	 * returns the items and the `<ul>` is this component's. `none` is for the
	 * cards whose rows are `<tr>`s, where a list element between the `<table>`
	 * and its rows is markup the browser throws away.
	 */
	readonly wrap?: 'list' | 'none';
	/** The rows. What sits around them is `wrap`'s. */
	readonly children: (rows: readonly Row[]) => ReactNode;
}) {
	if (reading.isError === true) {
		return <PanelRowsEmpty icon={icon} message={unavailable} />;
	}
	if (!reading.isReady) {
		return (
			<div aria-hidden="true" className="grid gap-2">
				{PLACEHOLDER_KEYS.map((key) => (
					<Skeleton className="h-16 w-full" key={key} />
				))}
			</div>
		);
	}
	if (instead !== undefined) {
		return <PanelRowsEmpty icon={icon} message={instead} />;
	}
	if (empty !== undefined && reading.rows.length === 0) {
		return <PanelRowsEmpty icon={icon} message={empty} />;
	}
	if (wrap === 'none') {
		return children(reading.rows);
	}
	return <ul className="grid gap-2">{children(reading.rows)}</ul>;
}

const PLACEHOLDER_KEYS = ['row-1', 'row-2'] as const;

/**
 * The one shape both message states draw.
 *
 * Eleven of these were written behind six local `{title, description}`
 * wrappers, all of them this markup with a different icon in the media slot.
 */
function PanelRowsEmpty({
	icon,
	message,
}: {
	readonly icon: ReactNode;
	readonly message: PanelRowsMessage;
}) {
	return (
		<Empty className="min-h-[140px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">{icon}</EmptyMedia>
				<EmptyTitle>{message.title}</EmptyTitle>
				<EmptyDescription>{message.description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
