/**
 * The comparison table on a period-in-review page: one `Panel` titled with
 * the period's short name, a row per shown record type, the two ratio rows
 * under a heavier rule, and a column per entry in the response's `columns`.
 * The headers come off the response, so the client does no date arithmetic;
 * the cut caption sits in the panel's `actions` slot when the period is
 * partial. `docs/today-spec.md`, "The table".
 *
 * A count in a real column is a `Link` to the type's explorer over the
 * column's whole period; an average cell is a number and no link, because no
 * explorer lists a mean; a ratio cell is never a link. A zero denominator
 * draws the absence glyph with `0` beside it, because `0%` would say every
 * inspection was negative.
 */

import type { OverviewGrain, OverviewResponse } from '@simmer-mosquito/domain';
import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { Panel, PanelMessage, RowSkeleton } from '@simmer-mosquito/ui-web/components/panel';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import { formatCount } from '../../lib/format-count';
import {
	columnHeader,
	columnLink,
	cutCaption,
	formatCell,
	formatRatio,
	OVERVIEW_LABELS,
	OVERVIEW_RATIO_LABELS,
	periodTitle,
	ratioValue,
	shownTypes,
} from './overview-data';

const TableIcon = iconRegistry.generic.chart.icon;

/** The one message the table draws in place of its rows. */
export type OverviewTableState =
	| { readonly kind: 'loading' }
	| { readonly kind: 'error' }
	| { readonly kind: 'empty' }
	| { readonly kind: 'ready'; readonly response: OverviewResponse };

const OVERVIEW_UNAVAILABLE = 'This period is unavailable right now.';
const OVERVIEW_NOTHING_RECORDED = 'Nothing has been recorded yet.';

export function OverviewTable({
	grain,
	period,
	state,
	dimmed,
}: {
	readonly grain: OverviewGrain;
	readonly period: string;
	readonly state: OverviewTableState;
	/** A refetch in flight: the previous render stays and dims. */
	readonly dimmed: boolean;
}) {
	const caption = state.kind === 'ready' ? cutCaption(grain, state.response.cutThrough) : null;
	return (
		<Panel
			actions={
				caption === null ? null : <span className="text-muted-foreground text-xs">{caption}</span>
			}
			className={cn(dimmed && 'opacity-60 transition-opacity')}
			icon={<TableIcon aria-hidden="true" className="size-4" />}
			title={periodTitle(grain, period)}
		>
			{state.kind === 'loading' ? (
				<RowSkeleton count={6} />
			) : state.kind === 'error' ? (
				<PanelMessage>{OVERVIEW_UNAVAILABLE}</PanelMessage>
			) : state.kind === 'empty' ? (
				<PanelMessage>{OVERVIEW_NOTHING_RECORDED}</PanelMessage>
			) : (
				<ComparisonTable grain={grain} response={state.response} />
			)}
		</Panel>
	);
}

function ComparisonTable({
	grain,
	response,
}: {
	readonly grain: OverviewGrain;
	readonly response: OverviewResponse;
}) {
	const columns = response.columns;
	return (
		<div className="overflow-x-auto">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="border-border/60 border-b">
						<th className={cn(HEAD, 'text-left')} scope="col">
							Record type
						</th>
						{columns.map((column, index) => (
							<th
								className={cn(HEAD, 'text-right', index === 0 && 'text-foreground')}
								key={column.key}
								scope="col"
							>
								{columnHeader(grain, column)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{shownTypes(response).map((row) => (
						<tr className="border-border/40 border-b" key={row.type}>
							<th className={ROW_HEAD} scope="row">
								{OVERVIEW_LABELS[row.type]}
							</th>
							{columns.map((column, index) => {
								const value = row.values[index];
								return (
									<td className={CELL} key={column.key}>
										{value === null || value === undefined ? (
											<AbsentValue />
										) : (
											<CountCell
												emphasis={index === 0}
												link={columnLink(grain, row.type, column)}
												value={value}
											/>
										)}
									</td>
								);
							})}
						</tr>
					))}
					{response.ratios.map((ratio, ratioIndex) => (
						<tr
							className={cn(
								'border-border/40 border-b',
								ratioIndex === 0 && 'border-t-2 border-t-border/80',
							)}
							key={ratio.ratio}
						>
							<th className={ROW_HEAD} scope="row">
								{OVERVIEW_RATIO_LABELS[ratio.ratio]}
							</th>
							{columns.map((column, index) => {
								const numerator = ratio.numerators[index] ?? 0;
								const denominator = ratio.denominators[index] ?? 0;
								const value = ratioValue(numerator, denominator);
								return (
									<td className={CELL} key={column.key}>
										<span className={cn('tabular-nums', index === 0 && 'font-semibold')}>
											{value === null ? <AbsentValue /> : formatRatio(ratio.ratio, value)}
											<span className="ml-1 text-muted-foreground text-xs">
												({formatCount(numerator)})
											</span>
										</span>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

const HEAD = 'px-3 py-2 font-medium text-muted-foreground text-xs';
const ROW_HEAD = 'px-4 py-2 text-left font-medium';
const CELL = 'px-3 py-2 text-right';

function CountCell({
	value,
	link,
	emphasis,
}: {
	readonly value: number;
	readonly link: LinkProps | null;
	readonly emphasis: boolean;
}) {
	const text = formatCell(value);
	if (link === null) {
		return <span className={cn('tabular-nums', emphasis && 'font-semibold')}>{text}</span>;
	}
	return (
		<Link
			{...link}
			className={cn(
				'text-foreground tabular-nums underline-offset-4 hover:underline',
				emphasis && 'font-semibold',
			)}
		>
			{text}
		</Link>
	);
}
