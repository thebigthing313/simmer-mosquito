/**
 * The species composition panel both surveillance overviews draw.
 *
 * Larval and adult surveillance answer the same question off different reads:
 * which species is most of what we identified, over the last week or the last
 * month. The panel, the fold behind it and the bar it draws were a line-for-line
 * copy in the two overviews, and the two largest non-generated clone groups
 * `pnpm fallow dupes` reported (#873).
 *
 * It holds no query. The caller owns the window state and does its own read,
 * because the two reads are a live `sample_species` subset on one side and a
 * server endpoint on the other, and a component that picked between them would
 * be the copy again with a flag on it. What arrives here is totals, ordered
 * largest first, and the two load flags.
 */

import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { addDaysToDateString } from '../lib/local-date';

const SpeciesIcon = iconRegistry.entities.taxonomy.icon;

/** One species and how many of it the window identified. */
export interface SpeciesTotal {
	readonly speciesId: string;
	readonly name: string;
	readonly total: number;
}

/** How many species get a bar of their own before the tail is summed into one. */
const SPECIES_PREVIEW_COUNT = 6;

/** The windows the toggle offers, and how many days each one reaches back. */
export type SpeciesWindow = '7d' | '30d';

const WINDOW_DAYS: Record<SpeciesWindow, number> = { '7d': 7, '30d': 30 };

/** Both overviews offer the same pair, so the pair is written once. */
export const SPECIES_WINDOWS: readonly SpeciesWindow[] = ['7d', '30d'];

/**
 * The first day a window covers, the window's last day being the caller's today.
 * A 7 day window reaching back 6 days is what makes today the seventh.
 */
export function speciesWindowSince(today: string, window: SpeciesWindow): string {
	return addDaysToDateString(today, -(WINDOW_DAYS[window] - 1));
}

/** The six species the panel draws, and the tail it sums into one "other" row. */
export function speciesPreview<TRow extends { readonly total: number }>(totals: readonly TRow[]) {
	const previewed = totals.slice(0, SPECIES_PREVIEW_COUNT);
	const rest = totals.slice(SPECIES_PREVIEW_COUNT);
	return {
		top: previewed,
		otherTotal: rest.reduce((sum, entry) => sum + entry.total, 0),
		otherCount: rest.length,
		maxBar: previewed[0]?.total ?? 1,
	};
}

export function SpeciesCompositionPanel({
	totals,
	grandTotal,
	isReady,
	isError,
	window,
	onWindowChange,
	windows,
	emptySubject,
}: {
	readonly totals: readonly SpeciesTotal[];
	readonly grandTotal: number;
	readonly isReady: boolean;
	readonly isError: boolean;
	readonly window: SpeciesWindow;
	readonly onWindowChange: (next: SpeciesWindow) => void;
	readonly windows: readonly SpeciesWindow[];
	/** What the domain counts, for the empty line: larvae, or specimens. */
	readonly emptySubject: string;
}) {
	const { top, otherTotal, otherCount, maxBar } = speciesPreview(totals);

	return (
		<Panel
			actions={
				<ToggleGroup
					aria-label="Species window"
					className="h-8"
					onValueChange={(next) => next && onWindowChange(next as SpeciesWindow)}
					size="sm"
					type="single"
					value={window}
					variant="outline"
				>
					{windows.map((offered) => (
						<ToggleGroupItem className="h-8 px-2.5 text-xs" key={offered} value={offered}>
							{offered}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			}
			icon={<SpeciesIcon className="size-4" />}
			title="Species Composition"
		>
			<PanelRows
				empty={{
					description: `No ${emptySubject} identified in the last ${WINDOW_DAYS[window]} days.`,
				}}
				icon={<SpeciesIcon aria-hidden="true" />}
				inset
				reading={{ isError, isReady, rows: top }}
				unavailable={{ description: 'Species data is unavailable right now.' }}
				wrap="none"
			>
				{(rows) => (
					<div className="grid gap-2.5 p-4">
						{rows.map((entry) => (
							<SpeciesBar
								barWidth={(entry.total / maxBar) * 100}
								entry={entry}
								key={entry.speciesId}
								percent={grandTotal === 0 ? 0 : (entry.total / grandTotal) * 100}
							/>
						))}
						{otherTotal > 0 ? (
							<SpeciesBar
								barWidth={(otherTotal / maxBar) * 100}
								entry={{ speciesId: '__other__', name: `Other (${otherCount})`, total: otherTotal }}
								muted
								percent={grandTotal === 0 ? 0 : (otherTotal / grandTotal) * 100}
							/>
						) : null}
					</div>
				)}
			</PanelRows>
		</Panel>
	);
}

function SpeciesBar({
	entry,
	percent,
	barWidth,
	muted = false,
}: {
	readonly entry: SpeciesTotal;
	readonly percent: number;
	readonly barWidth: number;
	readonly muted?: boolean;
}) {
	return (
		<div className="grid gap-1">
			<div className="flex items-baseline justify-between gap-2 text-sm">
				<span
					className={cn('truncate', muted ? 'text-muted-foreground' : 'text-foreground italic')}
				>
					{entry.name}
				</span>
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{entry.total.toLocaleString('en-US')} · {percent.toFixed(0)}%
				</span>
			</div>
			<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className={cn('h-full rounded-full', muted ? 'bg-muted-foreground/40' : 'bg-primary')}
					style={{ width: `${Math.max(barWidth, 2)}%` }}
				/>
			</div>
		</div>
	);
}
