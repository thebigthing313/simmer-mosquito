/**
 * PROTOTYPE variant C, table beside one chart: the comparison table on the
 * left with a selectable row, and one large chart on the right drawing the
 * selected row's trend. One chart at full size instead of nine small ones;
 * the row a person is reading is the chart they see.
 */

import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useState } from 'react';
import { RATIO_LABELS, type RatioKey, tableFor } from './prototype-data';
import {
	CountCell,
	columnPeriod,
	Legend,
	periodLabel,
	RatioCellView,
	TableHeadCells,
	type VariantProps,
} from './prototype-page';
import { type RowSubject, rowKey, TypeChart } from './prototype-type-chart';

const TableIcon = iconRegistry.generic.chart.icon;
const TrendIcon = iconRegistry.generic.chart.icon;

export function VariantFocus({ grain, period, options, openPeriod }: VariantProps) {
	const table = tableFor(period);
	const [selectedKey, setSelectedKey] = useState<string>('inspections');
	const selectedRow = table.rows.find((row) => row.type.key === selectedKey);
	const selected: RowSubject =
		selectedRow !== undefined
			? { kind: 'type', type: selectedRow.type }
			: { kind: 'ratio', ratio: selectedKey as RatioKey };
	const selectedLabel =
		selected.kind === 'type' ? selected.type.label : RATIO_LABELS[selected.ratio];
	const trendTitle =
		grain === 'day'
			? `${selectedLabel}, ${period.year} by day`
			: grain === 'month'
				? `${selectedLabel}, ${period.year} by month`
				: `${selectedLabel}, by year`;

	const rowButton = (subject: RowSubject, label: string) => {
		const key = rowKey(subject);
		const active = key === selectedKey;
		return (
			<button
				aria-pressed={active}
				className={cn(
					'-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-0.5 text-left font-medium',
					active ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
				)}
				onClick={() => setSelectedKey(key)}
				type="button"
			>
				<span
					aria-hidden="true"
					className={cn('size-1.5 shrink-0 rounded-full', active ? 'bg-primary' : 'bg-transparent')}
				/>
				{label}
			</button>
		);
	};

	return (
		<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<Panel
				actions={
					table.caption === null ? null : (
						<span className="text-muted-foreground text-xs">{table.caption}</span>
					)
				}
				icon={<TableIcon aria-hidden="true" className="size-4" />}
				title={periodLabel(period)}
			>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-border/60 border-b">
								<th
									className="px-4 py-2 text-left font-medium text-muted-foreground text-xs"
									scope="col"
								>
									Record type
								</th>
								<TableHeadCells headers={table.columns.map((c) => c.header)} />
							</tr>
						</thead>
						<tbody>
							{table.rows.map((row) => (
								<tr
									className={cn(
										'border-border/40 border-b',
										row.type.key === selectedKey && 'bg-primary/5',
									)}
									key={row.type.key}
								>
									<th className="px-4 py-1.5 text-left" scope="row">
										{rowButton({ kind: 'type', type: row.type }, row.type.label)}
									</th>
									{row.cells.map((cell, i) => (
										<td className="px-3 py-1.5 text-right" key={table.columns[i]?.key}>
											<CountCell
												at={columnPeriod(period, i)}
												cell={cell}
												emphasis={i === 0}
												type={row.type}
											/>
										</td>
									))}
								</tr>
							))}
							{table.ratios.map((ratio, index) => (
								<tr
									className={cn(
										'border-border/40 border-b',
										index === 0 && 'border-t-2 border-t-border/80',
										ratio.key === selectedKey && 'bg-primary/5',
									)}
									key={ratio.key}
								>
									<th className="px-4 py-1.5 text-left" scope="row">
										{rowButton({ kind: 'ratio', ratio: ratio.key }, ratio.label)}
									</th>
									{ratio.cells.map((cell, i) => (
										<td className="px-3 py-1.5 text-right" key={table.columns[i]?.key}>
											<RatioCellView cell={cell} emphasis={i === 0} ratio={ratio.key} />
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Panel>
			<Panel
				actions={<Legend comparison={options.comparison} period={period} />}
				icon={<TrendIcon aria-hidden="true" className="size-4" />}
				title={trendTitle}
			>
				<div className="px-3 pt-4 pb-2 [&_.h-52]:h-80">
					<TypeChart openPeriod={openPeriod} options={options} period={period} subject={selected} />
				</div>
			</Panel>
		</div>
	);
}
