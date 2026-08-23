import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { Tag } from '../../hooks/queries/tag-view';
import { TagChipRow } from '../tag-chip';

/**
 * One entry in an explorer's result list.
 *
 * The row has two jobs and they were being wired differently on every page.
 * Clicking anywhere on it focuses the record on the map; the chevron on the
 * right opens its detail page. Those are sibling controls — a background button
 * plus a layered link — rather than a link nested in a button, which keeps the
 * markup valid while both behaviours coexist.
 *
 * The left rail is fixed-width whether or not the record has a date, so rows
 * line up down the list even where dated and undated records mix. Dates carry
 * the year: an explorer can be pointed at any window, and "Mar 4" in a list that
 * spans two seasons is ambiguous.
 */
export function ExplorerRow({
	title,
	titleLink,
	subtitle,
	date,
	swatch,
	personnel,
	tags,
	badges,
	detailLink,
	detailLabel,
	isSelected,
	selectLabel,
	onSelect,
}: {
	/** Primary label. Rendered as a link when `titleLink` is given. */
	readonly title: string;
	readonly titleLink?: LinkProps;
	/** Second line — the record's type, method, or address; may carry a link. */
	readonly subtitle?: ReactNode;
	/**
	 * Operational date, pre-formatted. Pass `null` for a record that has none in
	 * a list where others do — the rail still reserves its width, so the column
	 * holds. Omit the prop entirely on a list where *no* record is dated, and the
	 * rail is not drawn at all.
	 */
	readonly date?: string | null;
	/** Colour this record draws in on the map, shown as a leading dot. */
	readonly swatch?: { readonly color: string; readonly label: string } | undefined;
	/** Who performed the work — inspector, applicator, technician. */
	readonly personnel?: string | null;
	readonly tags?: readonly Tag[];
	/** Status pills, life-stage strips: whatever this record type reads by. */
	readonly badges?: ReactNode;
	/** Where the chevron goes — this record's detail page. */
	readonly detailLink: LinkProps;
	readonly detailLabel: string;
	readonly isSelected: boolean;
	readonly selectLabel: string;
	/**
	 * Show this record on the map. Omit it for a record that has no coordinates to
	 * show, such as a station whose centroid has not synced or an address that
	 * never geocoded. The row then draws without the stretched button rather than with a
	 * control that does nothing, and its links still work.
	 */
	readonly onSelect?: (() => void) | undefined;
}) {
	/*
	 * Where the badges go. Beside the title they are a tidy right-aligned pill;
	 * under it they are a row of their own.
	 *
	 * The date column decides, because it is the 88px that makes the inline
	 * version impossible. In a 380px rail a dated row spends 158px on the swatch,
	 * the date, the chevron and the padding before the record gets a pixel, and
	 * the badge group on the rich surfaces is another 175px, an inspection's
	 * density badge plus its life-stage strip. That left the title column at
	 * literally zero and the record drew with no name on it at all.
	 *
	 * Undated rows have the room, so they keep the pill.
	 */
	const isStacked = badges !== undefined && date !== undefined;
	const hasPersonnel = personnel !== null && personnel !== undefined && personnel.length > 0;
	const dateParts = splitDate(date);

	return (
		<li className="relative">
			{onSelect === undefined ? null : (
				<button
					aria-label={selectLabel}
					aria-pressed={isSelected}
					className={cn(
						'absolute inset-0 size-full transition-colors',
						// Inset, because the button is stretched over the row and an outset
						// ring would be clipped by the list that scrolls it. Without this the
						// row fell back to the browser's own 1px outline while every other
						// control in the panel drew the 2px ring.
						'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
						/*
						 * The ring is opaque. At `ring-primary/40` it composited toward the
						 * row behind it, the very surface it has to stand against, which is
						 * what DESIGN.md's Solid Indicator Rule exists to stop. The 8% wash
						 * stays: that is a fill, not the indicator.
						 */
						isSelected ? 'bg-primary/8 ring-1 ring-primary ring-inset' : 'hover:bg-muted/50',
					)}
					onClick={onSelect}
					type="button"
				/>
			)}
			<div
				className={cn(
					'pointer-events-none relative flex gap-3 px-4 py-3',
					// A stacked row is taller than its date and its chevron, so those
					// align to the first line rather than to the middle of the block.
					isStacked ? 'items-start' : 'items-center',
				)}
			>
				{swatch === undefined ? null : (
					/*
					 * Labelled, not decorative. On the surfaces that dropped their status
					 * pill the dot is the only thing left saying whether a record is active
					 * or out of reach, and a `title` on an aria-hidden span reaches a mouse
					 * and nothing else.
					 */
					<span
						aria-label={swatch.label}
						className={cn(
							'size-2.5 shrink-0 rounded-full ring-1 ring-foreground/15',
							isStacked && 'mt-1',
						)}
						role="img"
						style={{ backgroundColor: swatch.color }}
						title={swatch.label}
					/>
				)}
				{/*
				 * Reserved whether or not *this* record has a date, so a list mixing
				 * dated and undated records keeps one left edge. A list where dates are
				 * not part of the record at all omits the prop and gets its width back.
				 *
				 * The year sits under the day rather than beside it. `Aug 12, 2026` on
				 * one line needs 88px, and in a 380px rail that was a quarter of the row
				 * spent on a number that is the same for every record in a 30-day
				 * window. Stacked, the column is 52px and the record keeps the 36.
				 */}
				{date === undefined ? null : (
					<span
						className={cn(
							'w-[3.25rem] shrink-0 text-muted-foreground text-xs leading-tight tabular-nums',
							isStacked && 'pt-0.5',
						)}
					>
						<span className="block">{dateParts.head}</span>
						{dateParts.year === null ? null : <span className="block">{dateParts.year}</span>}
					</span>
				)}
				<span className="min-w-0 flex-1">
					{titleLink === undefined ? (
						<span className="block truncate font-medium text-foreground text-sm">{title}</span>
					) : (
						<Link
							{...titleLink}
							className="pointer-events-auto relative z-10 block w-fit max-w-full truncate rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						>
							{title}
						</Link>
					)}
					{subtitle === null || subtitle === undefined || subtitle === '' ? null : (
						<span className="block truncate text-muted-foreground text-xs">{subtitle}</span>
					)}
					{hasPersonnel ? (
						<span className="mt-0.5 block truncate text-muted-foreground text-xs">{personnel}</span>
					) : null}
					{/*
					 * A line of their own, under whoever did the work rather than beside
					 * them. They shared a line and wrapped when they had to, which meant a
					 * short name left the badges inline and a long one pushed them down: the
					 * strip moved from row to row down the rail with nothing but name length
					 * deciding, and read as a difference between the records.
					 */}
					{isStacked && badges !== null ? (
						<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">{badges}</div>
					) : null}
					{tags === undefined || tags.length === 0 ? null : (
						<TagChipRow className="mt-1" tags={tags} />
					)}
				</span>
				{badges === undefined || isStacked ? null : (
					<div className="flex shrink-0 items-center gap-1.5">{badges}</div>
				)}
				<Link
					{...detailLink}
					aria-label={detailLabel}
					className="pointer-events-auto relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title={detailLabel}
				>
					<ChevronRightIcon aria-hidden="true" className="size-4" />
				</Link>
			</div>
		</li>
	);
}

/**
 * `Aug 12, 2026` into its two lines, and `Aug 12` into one.
 *
 * The split is on the last comma because that is where `en-US`'s `MMM d, yyyy`
 * puts it, and the callers that pass a day without a year have no comma to find.
 * Anything else, including the `—` a caller shows for an unparseable date, comes
 * back whole on the first line rather than being cut somewhere arbitrary.
 */
function splitDate(date: string | null | undefined): {
	readonly head: string;
	readonly year: string | null;
} {
	if (date === null || date === undefined) {
		return { head: '', year: null };
	}
	const comma = date.lastIndexOf(', ');
	if (comma === -1) {
		return { head: date, year: null };
	}
	return { head: date.slice(0, comma), year: date.slice(comma + 2) };
}
