/**
 * The in-view summary an explorer rail draws in place of its rows when more
 * records are in view than fit on one page: the active filter chips, then one
 * section per grouping, each value with its count. A value with a filter
 * behind it is a button that applies the filter, pressed while the filter
 * holds it. Takes the groupings already built from the summary, the chips,
 * and the summary request's state.
 */

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { CheckIcon, OctagonXIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type ReactNode, useId } from 'react';
import type { ExplorerSummaryState } from '../../hooks/explorer/use-explorer-summary';
import { formatCount } from '../../lib/format-count';
import { type RecordType, recordCount } from '../../lib/record-nouns';

/** How many values a grouping lists before it counts the rest. */
const GROUPING_LIMIT = 5;

/** One value of a grouping, as the summary draws it. */
export interface SummaryGroup {
	readonly key: string;
	readonly label: string;
	readonly count: number;
	/**
	 * What the value reads in place of its count, such as an amount with its
	 * unit. A figure has no filter behind it, so it is drawn as text.
	 */
	readonly figure?: string;
	/** The filter holds this value, so clicking it takes the value back out. */
	readonly isSelected?: boolean;
	/** Writes the filter this value names. Absent where no filter selects it. */
	readonly onToggle?: (() => void) | undefined;
}

/** One grouping, its values in the order they are drawn. */
export interface SummaryGrouping {
	readonly key: string;
	readonly title: string;
	readonly groups: readonly SummaryGroup[];
}

/** The summary request as this component reads it. */
type SummaryRequest = Pick<ExplorerSummaryState, 'data' | 'isError' | 'retry'>;

/** What the summary draws, which the body below takes whole. */
interface SummaryContent {
	/** What the counts count, for each group's accessible name. */
	readonly recordType: RecordType;
	readonly groupings: readonly SummaryGrouping[];
	readonly state: SummaryRequest;
}

export function ExplorerSummary({
	recordType,
	chips,
	groupings,
	state,
}: SummaryContent & {
	/** The surface's active filter chips, drawn above the groupings. */
	readonly chips?: ReactNode;
}) {
	return (
		<div className="grid gap-4 p-3">
			{chips}
			<SummaryBody groupings={groupings} recordType={recordType} state={state} />
		</div>
	);
}

/** The groupings, or what stands in for them before the first summary arrives. */
function SummaryBody({ recordType, groupings, state }: SummaryContent) {
	if (state.data === null) {
		return state.isError ? (
			<SummaryFailed hasData={false} onRetry={state.retry} />
		) : (
			<div className="grid gap-2">
				{SKELETON_KEYS.map((key) => (
					<Skeleton className="h-8" key={key} />
				))}
			</div>
		);
	}
	return (
		<>
			{state.isError ? <SummaryFailed hasData onRetry={state.retry} /> : null}
			{groupings
				.filter((grouping) => grouping.groups.length > 0)
				.map((grouping) => (
					<SummarySection grouping={grouping} key={grouping.key} recordType={recordType} />
				))}
		</>
	);
}

const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/**
 * The request failed. Before any summary has arrived this is all the panel
 * says; with one on screen it is a line above the last good answer, which
 * the caller keeps drawing.
 */
function SummaryFailed({
	hasData,
	onRetry,
}: {
	readonly hasData: boolean;
	readonly onRetry: () => void;
}) {
	return (
		<div
			className={cn(
				'flex items-center gap-2 text-sm',
				hasData ? 'text-xs' : 'flex-col py-6 text-center',
			)}
			role="alert"
		>
			<OctagonXIcon aria-hidden="true" className="size-5 text-destructive/70" />
			<span className="text-foreground">Could not load the summary.</span>
			<Button onClick={onRetry} size="sm" variant="outline">
				Try Again
			</Button>
		</div>
	);
}

function SummarySection({
	recordType,
	grouping,
}: {
	readonly recordType: RecordType;
	readonly grouping: SummaryGrouping;
}) {
	const titleId = useId();
	const shown = grouping.groups.slice(0, GROUPING_LIMIT);
	const more = grouping.groups.length - shown.length;
	return (
		<section aria-labelledby={titleId} className="grid gap-1">
			<h3 className="font-medium text-muted-foreground text-xs" id={titleId}>
				{grouping.title}
			</h3>
			<ul className="grid gap-px">
				{shown.map((group) => (
					<li key={group.key}>
						<SummaryValue group={group} recordType={recordType} />
					</li>
				))}
			</ul>
			{more > 0 ? (
				<p className="px-2 text-muted-foreground text-xs">{`${formatCount(more)} more`}</p>
			) : null}
		</section>
	);
}

/** One value and its count: a button where a filter selects it, text where none does. */
function SummaryValue({
	recordType,
	group,
}: {
	readonly recordType: RecordType;
	readonly group: SummaryGroup;
}) {
	const content = (
		<>
			<span className="flex min-w-0 items-center gap-1.5">
				{group.isSelected === true ? (
					<CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
				) : null}
				<span className="truncate">{group.label}</span>
			</span>
			<span className="text-muted-foreground tabular-nums">
				{group.figure ?? formatCount(group.count)}
			</span>
		</>
	);
	const row = 'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm';

	if (group.onToggle === undefined) {
		return <div className={cn(row, 'text-foreground')}>{content}</div>;
	}
	return (
		<button
			aria-label={`${group.label}, ${recordCount(recordType, group.count)}`}
			aria-pressed={group.isSelected === true}
			className={cn(
				row,
				'text-left text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
				group.isSelected === true ? 'bg-accent/60 font-medium' : undefined,
			)}
			onClick={group.onToggle}
			type="button"
		>
			{content}
		</button>
	);
}
