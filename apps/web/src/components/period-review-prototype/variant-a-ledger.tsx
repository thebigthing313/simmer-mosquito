/**
 * PROTOTYPE variant A, the ledger: one table where every record type is a
 * row, the four comparison columns sit beside the label, and a compact chart
 * of the trend is the last column of the same row. The two ratio rows sit
 * under a rule at the bottom. The numbers and the trend are read on one line.
 */

import { Panel } from '@simmer-mosquito/ui-web/components/panel';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { tableFor } from './prototype-data';
import {
	CountCell,
	columnPeriod,
	Legend,
	periodLabel,
	RatioCellView,
	TableHeadCells,
	type VariantProps,
} from './prototype-page';
import { TypeChart } from './prototype-type-chart';

const TableIcon = iconRegistry.generic.chart.icon;

export function VariantLedger({ grain, period, options, openPeriod }: VariantProps) {
	const table = tableFor(period);
	const chartOptions = { ...options, compact: true };
	const trendHeader =
		grain === 'day'
			? `${period.year} by day`
			: grain === 'month'
				? `${period.year} by month`
				: 'By year';
	return (
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
							<TableHeadCells
								headers={table.columns.map((c) => c.header)}
								trailing={
									<th
										className="w-64 px-4 py-2 text-left font-medium text-muted-foreground text-xs"
										scope="col"
									>
										<span className="flex items-center justify-between gap-3">
											{trendHeader}
											<Legend comparison={options.comparison} period={period} />
										</span>
									</th>
								}
							/>
						</tr>
					</thead>
					<tbody>
						{table.rows.map((row) => (
							<tr className="border-border/40 border-b" key={row.type.key}>
								<th className="px-4 py-1.5 text-left font-medium" scope="row">
									{row.type.label}
								</th>
								{row.cells.map((cell, i) => (
									<td
										className={cn('px-3 py-1.5 text-right', i === 0 && 'text-foreground')}
										key={table.columns[i]?.key}
									>
										<CountCell
											at={columnPeriod(period, i)}
											cell={cell}
											emphasis={i === 0}
											type={row.type}
										/>
									</td>
								))}
								<td className="px-2 py-1">
									<div className="w-60">
										<TypeChart
											openPeriod={openPeriod}
											options={chartOptions}
											period={period}
											subject={{ kind: 'type', type: row.type }}
										/>
									</div>
								</td>
							</tr>
						))}
						{table.ratios.map((ratio, index) => (
							<tr
								className={cn(
									'border-border/40 border-b',
									index === 0 && 'border-t-2 border-t-border/80',
								)}
								key={ratio.key}
							>
								<th className="px-4 py-1.5 text-left font-medium" scope="row">
									{ratio.label}
								</th>
								{ratio.cells.map((cell, i) => (
									<td className="px-3 py-1.5 text-right" key={table.columns[i]?.key}>
										<RatioCellView cell={cell} emphasis={i === 0} ratio={ratio.key} />
									</td>
								))}
								<td className="px-2 py-1">
									<div className="w-60">
										<TypeChart
											openPeriod={openPeriod}
											options={chartOptions}
											period={period}
											subject={{ kind: 'ratio', ratio: ratio.key }}
										/>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Panel>
	);
}
