import type { TagRow } from '@simmer-mosquito/sync';
import { ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
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
	/** Operational date, pre-formatted. Omit for records that carry none. */
	readonly date?: string | null;
	/** Colour this record draws in on the map, shown as a leading dot. */
	readonly swatch?: { readonly color: string; readonly label: string } | undefined;
	/** Who performed the work — inspector, applicator, technician. */
	readonly personnel?: string | null;
	readonly tags?: readonly TagRow[];
	/** Status pills, life-stage strips: whatever this record type reads by. */
	readonly badges?: ReactNode;
	/** Where the chevron goes — this record's detail page. */
	readonly detailLink: LinkProps;
	readonly detailLabel: string;
	readonly isSelected: boolean;
	readonly selectLabel: string;
	readonly onSelect: () => void;
}) {
	return (
		<li className="relative">
			<button
				aria-label={selectLabel}
				aria-pressed={isSelected}
				className={cn(
					'absolute inset-0 size-full transition-colors',
					isSelected ? 'bg-primary/8 ring-1 ring-primary/40 ring-inset' : 'hover:bg-muted/50',
				)}
				onClick={onSelect}
				type="button"
			/>
			<div className="pointer-events-none relative flex items-center gap-3 px-4 py-3">
				{swatch === undefined ? null : (
					<span
						aria-hidden="true"
						className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
						style={{ backgroundColor: swatch.color }}
						title={swatch.label}
					/>
				)}
				{/*
				 * Reserved whether or not this record has a date, so a list mixing dated
				 * and undated records keeps one left edge.
				 */}
				<span className="w-[4.5rem] shrink-0 text-muted-foreground text-xs tabular-nums">
					{date ?? ''}
				</span>
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
					{personnel === null || personnel === undefined || personnel.length === 0 ? null : (
						<span className="block truncate text-muted-foreground text-xs">{personnel}</span>
					)}
					{tags === undefined || tags.length === 0 ? null : (
						<TagChipRow className="mt-1" tags={tags} />
					)}
				</span>
				{badges === undefined ? null : (
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
