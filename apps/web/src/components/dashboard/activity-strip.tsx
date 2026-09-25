import { PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import { useState } from 'react';
import { useActivityStrip } from '../../hooks/dashboard/use-activity-strip';
import { type CountNoun, formatCount } from '../../lib/format-count';
import { formatMonthDay } from '../../lib/local-date';
import { recordNoun } from '../../lib/record-nouns';
import {
	ACTIVITY_TYPE_KEYS,
	type ActivityTypeKey,
	type ChangeMode,
	changeLabel,
	changeSentence,
	comparisonPhrase,
} from './dashboard-data';

const ACTIVITY_UNAVAILABLE = 'Activity is unavailable right now.';

/** What each strip cell is called, by the type the hook counts it as. */
const ACTIVITY_LABELS: Readonly<Record<ActivityTypeKey, string>> = {
	inspections: recordNoun('inspection').titleMany,
	samples: recordNoun('sample').titleMany,
	collections: recordNoun('collection').titleMany,
	applications: recordNoun('application').titleMany,
	sourceReductions: recordNoun('sourceReduction').titleMany,
	releases: recordNoun('biocontrolAction').titleMany,
	serviceRequests: `${recordNoun('serviceRequest').titleMany} received`,
	outreachActions: recordNoun('outreachAction').titleMany,
};

/** What each cell counts, as the sentence a screen reader hears names it. */
const ACTIVITY_NOUNS: Readonly<Record<ActivityTypeKey, CountNoun>> = {
	inspections: recordNoun('inspection'),
	samples: recordNoun('sample'),
	collections: recordNoun('collection'),
	applications: recordNoun('application'),
	sourceReductions: recordNoun('sourceReduction'),
	releases: recordNoun('biocontrolAction'),
	serviceRequests: {
		one: `${recordNoun('serviceRequest').one} received`,
		many: `${recordNoun('serviceRequest').many} received`,
	},
	outreachActions: recordNoun('outreachAction'),
};

/** The two ways the strip states a change, as the toggle offers them. */
const CHANGE_MODES: readonly {
	readonly value: ChangeMode;
	readonly glyph: string;
	readonly name: string;
}[] = [
	{ value: 'count', glyph: '#', name: 'Change as a count' },
	{ value: 'percent', glyph: '%', name: 'Change as a percentage' },
];

/**
 * One ruled strip: a heading, the window's dates and a count-or-percent
 * toggle, then a bordered row of eight cells, all eight across on a wide
 * screen, four at `sm`, two below. Every type is a cell, at `0` when the
 * Organization has recorded none. Reads the synced tables through
 * `useActivityStrip`, so a cell moves when a write syncs.
 */
export function ActivityStrip({
	today,
	timeZone,
}: {
	readonly today: string;
	readonly timeZone: string;
}) {
	const activity = useActivityStrip(today, timeZone);
	const [mode, setMode] = useState<ChangeMode>('count');
	return (
		<section className="grid gap-2">
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
				<h2 className="m-0 font-semibold text-foreground text-sm">
					{`Last ${activity.windowDays} Days`}
				</h2>
				<div className="flex items-center gap-3">
					<span className="text-muted-foreground text-xs">
						{`${formatMonthDay(activity.window.from)} to ${formatMonthDay(activity.window.to)}, change ${comparisonPhrase(activity.windowDays)}`}
					</span>
					<ToggleGroup
						aria-label="Show the change as"
						onValueChange={(next) => {
							// An empty string is the pressed segment pressed again; the
							// strip always states the change one way or the other.
							if (next) {
								setMode(next as ChangeMode);
							}
						}}
						size="sm"
						type="single"
						value={mode}
						variant="outline"
					>
						{CHANGE_MODES.map((option) => (
							<ToggleGroupItem
								aria-label={option.name}
								className="px-2 font-mono text-xs"
								key={option.value}
								value={option.value}
							>
								{option.glyph}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>
			</div>
			{/*
			 * Not `PanelRows`: this is one row of cells rather than rows, and its
			 * two-row placeholder would stand in for a strip a single row tall.
			 */}
			{activity.isError ? (
				<div className="rounded-md border border-border/60">
					<PanelMessage>{ACTIVITY_UNAVAILABLE}</PanelMessage>
				</div>
			) : !activity.isReady ? (
				<div className="rounded-md border border-border/60">
					<RowSkeleton count={1} />
				</div>
			) : (
				<div className="grid grid-cols-2 divide-x divide-border/60 overflow-hidden rounded-md border border-border/60 sm:grid-cols-4 xl:grid-cols-8">
					{ACTIVITY_TYPE_KEYS.map((key) => (
						<ActivityCell
							cell={activity.types[key]}
							key={key}
							mode={mode}
							type={key}
							windowDays={activity.windowDays}
						/>
					))}
				</div>
			)}
		</section>
	);
}

/**
 * One cell: the count, the signed change beside it, and the type's label
 * under both. The change is one neutral tone whichever way it went, because
 * the strip reports the week and does not judge it; the heading's line names
 * the window it is measured against.
 *
 * What is drawn is hidden from assistive technology and a sentence stands in
 * for it, because the drawn order announced as "622 -913 Inspections".
 */
function ActivityCell({
	type,
	cell,
	mode,
	windowDays,
}: {
	readonly type: ActivityTypeKey;
	readonly cell: { readonly count: number; readonly prior: number };
	readonly mode: ChangeMode;
	readonly windowDays: number;
}) {
	const change = changeLabel(cell.count, cell.prior, mode);
	return (
		<div className="grid gap-0.5 px-3 py-2.5">
			<span className="sr-only">
				{changeSentence(cell.count, cell.prior, mode, ACTIVITY_NOUNS[type], windowDays)}
			</span>
			<span aria-hidden="true" className="flex items-baseline gap-1.5">
				<span className="font-semibold text-xl tabular-nums leading-none">
					{formatCount(cell.count)}
				</span>
				<span className="text-muted-foreground text-xs tabular-nums">{change.text}</span>
			</span>
			<span aria-hidden="true" className="truncate text-muted-foreground text-xs">
				{ACTIVITY_LABELS[type]}
			</span>
		</div>
	);
}
