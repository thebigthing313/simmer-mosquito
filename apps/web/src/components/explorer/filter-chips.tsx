import { XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';
import { dateRangeLabel } from '../../lib/local-date';

/**
 * The active-filter row every explorer shows above its results.
 *
 * Each chip names one narrowing and removes exactly that one; "Clear all" resets
 * the lot. Explorers had grown seven near-identical copies of this pair, which is
 * how three of them ended up without the remove buttons at all.
 */
export function ActiveFilterBar({
	children,
	onClearAll,
}: {
	readonly children: ReactNode;
	readonly onClearAll: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{children}
			<button
				className="relative ml-auto rounded-sm px-1.5 py-0.5 text-muted-foreground after:absolute after:-inset-y-1.5 after:inset-x-0 text-xs transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onClearAll}
				type="button"
			>
				Clear all
			</button>
		</div>
	);
}

/** A date window: `YYYY-MM-DD` bounds, either one empty when that end is open. */
export interface DateRange {
	readonly from: string;
	readonly to: string;
}

/**
 * The date window's chip, `Dates: ` and the range, drawn only while the window
 * differs from the surface's default. Removing it writes the default bounds
 * back through `setRange` and touches no other filter. Takes the current
 * window, the default window and the write.
 */
export function DateRangeChip({
	defaults,
	range,
	setRange,
}: {
	readonly defaults: DateRange;
	readonly range: DateRange;
	readonly setRange: (range: DateRange) => void;
}) {
	if (range.from === defaults.from && range.to === defaults.to) {
		return null;
	}
	return (
		<FilterChip
			label={`Dates: ${dateRangeLabel(range.from, range.to)}`}
			onRemove={() => setRange({ from: defaults.from, to: defaults.to })}
		/>
	);
}

/** The same set less one value, for the chip that removes that value. */
export function without<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
	const next = new Set(set);
	next.delete(value);
	return next;
}

/** One active filter, with the swatch it maps to on the map when it has one. */
export function FilterChip({
	label,
	color,
	italic = false,
	onRemove,
}: {
	readonly label: string;
	/** Map colour this value draws in, so the chip doubles as a legend entry. */
	readonly color?: string | null | undefined;
	/** For binomial species names, which are italic wherever they appear. */
	readonly italic?: boolean;
	readonly onRemove: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-foreground text-xs">
			{color === undefined || color === null ? null : (
				<span
					aria-hidden="true"
					className="size-2 shrink-0 rounded-full ring-1 ring-foreground/15"
					style={{ backgroundColor: color }}
				/>
			)}
			<span className={italic ? 'italic' : undefined}>{label}</span>
			<button
				aria-label={`Remove ${label} filter`}
				className="relative rounded-full p-0.5 opacity-70 transition-opacity after:absolute after:-inset-1.5 hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onRemove}
				type="button"
			>
				<XIcon aria-hidden="true" className="size-3" />
			</button>
		</span>
	);
}
